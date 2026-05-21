const uid = () => crypto.randomUUID();
import React, { useMemo, useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import {
  auth,
  db,
  ai,
} from "./firebase";
import { getGenerativeModel } from "firebase/ai";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  User,
} from "firebase/auth";
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  deleteDoc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import {
  BudgetLine,
  ExpenseLine,
  MortgageInputs,
  PayeIncome,
  SavingsBucket,
  SelfEmployment,
  TaxSettings,
  budgetSummary,
  calculateIncomeTax,
  calculateMortgage,
  calculateTaxSummary,
  clampNumber,
  money,
  monthlyMoney,
  projectSavings,
  requiredGrossForNet,
  calculateNhsEmployeeRate,
  NHS_EMPLOYER_RATE,
  calculateRetirementGrossRequired,
  getFinancialSnapshot,
  FinancialSnapshot,
} from "./calculations";
import "./styles.css";


export function updateItem<T extends { id: string }>(items: T[], id: string, patch: Partial<T>) {
  return items.map((item) => (item.id === id ? { ...item, ...patch } : item));
}

export function TextInput({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <input placeholder={placeholder} value={value} onChange={(event) => onChange(event.target.value)} />;
}

export function NumberInput({ value, onChange, suffix, placeholder }: { value: number; onChange: (value: number) => void; suffix?: string; placeholder?: string }) {
  return (
    <span className="number-field">
      <input
        type="number"
        placeholder={placeholder}
        value={value === 0 ? "" : value}
        onChange={(event) => onChange(event.target.value === "" ? 0 : Number(event.target.value))}
      />
      {suffix ? <span>{suffix}</span> : null}
    </span>
  );
}

export function Metric({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "green" | "amber" | "red" }) {
  return (
    <article className={`metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

export function PanelHeader({ title, actionLabel, onAction }: { title: string; actionLabel: string; onAction: () => void }) {
  return (
    <div className="split-title">
      <h2>{title}</h2>
      <button onClick={onAction}>{actionLabel}</button>
    </div>
  );
}

export function ResultRows({ rows }: { rows: [string, string | number][] }) {
  const filteredRows = rows.filter(([_, value]) => typeof value === 'string' || Math.abs(value) >= 0.01);
  return (
    <div className="result-rows">
      {filteredRows.map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <strong>{typeof value === 'number' ? money.format(value) : value}</strong>
        </div>
      ))}
    </div>
  );
}

// ... rest of imports ...
type SectionId = "overview" | "income" | "tax" | "budget" | "savings" | "mortgage" | "retirement" | "profile" | "settings";


type Plan = {
  id: string;
  name: string;
  userId: string;
  updatedAt: Timestamp;
  data: {
    paye: PayeIncome[];
    selfEmployment: SelfEmployment[];
    taxSettings: TaxSettings;
    budgetLines: BudgetLine[];
    annualBills: ExpenseLine[];
    savings: SavingsBucket[];
    projectionYears: number;
    mortgage: MortgageInputs;
    birthYear: number;
    birthMonth: number;
    retirementAge: number;
    expectedOutgoings: number;
    otherRetirementIncome: (ExpenseLine & { isTaxable?: boolean })[];
    drawdownRate: number;
    drawdownSettings: Record<string, { enabled: boolean; rate: number; lumpSumTaken?: boolean }>;
    inflationRate: number;
    additionalRetirementExpenses: ExpenseLine[];
    retirementTaxableFraction?: number;
    showLisaUnder60?: boolean;
  };
};

function AuthScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignup, setIsSignup] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      if (isSignup) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h1>{isSignup ? "Create Account" : "Sign In"}</h1>
        <form onSubmit={handleSubmit}>
          <label>
            Email
            <input type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label>
            Password
            <input type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          {error && <div className="error-notice">{error}</div>}
          <button type="submit">{isSignup ? "Sign Up" : "Sign In"}</button>
        </form>
        <button className="secondary" onClick={() => setIsSignup(!isSignup)}>
          {isSignup ? "Already have an account? Sign In" : "Need an account? Sign Up"}
        </button>
      </div>
    </div>
  );
}


const initialPaye: PayeIncome[] = [
  { id: uid(), label: "", gross: 0, pensionRate: 0, employerPensionContribution: 0 },
];

const initialSelfEmployment: SelfEmployment[] = [
  { id: uid(), label: "", gross: 0, expenses: [] },
];

const initialBudget: BudgetLine[] = [
  { id: uid(), label: "", amount: 0, bucket: "living" },
];

const initialAnnualBills: ExpenseLine[] = [];

const initialSavings: SavingsBucket[] = [
  { id: uid(), label: "", balance: 0, monthly: 0, annualRate: 4, type: "cash", isHidden: false },
];

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [currentPlanId, setCurrentPlanId] = useState<string | null>(null);

  const [activeSection, setActiveSection] = useState<SectionId>("overview");
  const [paye, setPaye] = useState(initialPaye);
  const [selfEmployment, setSelfEmployment] = useState(initialSelfEmployment);
  const [taxSettings, setTaxSettings] = useState<TaxSettings>({
    taxCode: "1257L",
    region: "england-wales-ni",
    sippNetContribution: 0,
  });
  const [budgetLines, setBudgetLines] = useState(initialBudget);
  const [annualBills, setAnnualBills] = useState(initialAnnualBills);
  const [savings, setSavings] = useState(initialSavings);
  const [projectionYears, setProjectionYears] = useState(10);
  const [mortgage, setMortgage] = useState<MortgageInputs>({
    amount: 0,
    annualRate: 0,
    years: 0,
    monthlyOverpayment: 0,
    oneOffMonth: 0,
    oneOffAmount: 0,
  });

  const [birthYear, setBirthYear] = useState(1990);
  const [birthMonth, setBirthMonth] = useState(1);
  const [expectedOutgoings, setExpectedOutgoings] = useState(0);
  const [drawdownRate, setDrawdownRate] = useState(4); // Defaulting to 4%
  const [otherRetirementIncome, setOtherRetirementIncome] = useState<(ExpenseLine & { isTaxable?: boolean })[]>([]);
  const [drawdownSettings, setDrawdownSettings] = useState<Record<string, { enabled: boolean; rate: number; lumpSumTaken?: boolean; useWithdrawAge?:any; withdrawAge?:any; useStopAge?:any; stopAge?:any }>>({});
  const [inflationRate, setInflationRate] = useState(3);
  const [additionalRetirementExpenses, setAdditionalRetirementExpenses] = useState<ExpenseLine[]>([]);
  const [retirementTaxableFraction, setRetirementTaxableFraction] = useState(0.75);
  const [showLisaUnder60, setShowLisaUnder60] = useState(true);

  const currentDataString = useMemo(() => JSON.stringify({
    paye,
    selfEmployment,
    taxSettings,
    budgetLines,
    annualBills,
    savings,
    projectionYears,
    mortgage,
    birthYear,
    birthMonth,
    expectedOutgoings,
    drawdownRate,
    otherRetirementIncome,
    drawdownSettings,
    inflationRate,
    additionalRetirementExpenses,
    retirementTaxableFraction,
    showLisaUnder60,
  }), [
    paye, selfEmployment, taxSettings, budgetLines, annualBills, savings,
    projectionYears, mortgage, birthYear, birthMonth, expectedOutgoings,
    drawdownRate, otherRetirementIncome, drawdownSettings, inflationRate,
    additionalRetirementExpenses, retirementTaxableFraction, showLisaUnder60
  ]);

  const [lastSavedData, setLastSavedData] = useState<string>(currentDataString);

  const hasUnsavedChanges = useMemo(() => {
    return lastSavedData !== currentDataString;
  }, [lastSavedData, currentDataString]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = "You have unsaved changes. Are you sure you want to leave?";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  const confirmUnsavedChanges = () => {
    if (hasUnsavedChanges) {
      return window.confirm("You have unsaved changes. Are you sure you want to proceed without saving?");
    }
    return true;
  };

  const pensionAccessAge = useMemo(() => {
    // April 6, 1973 is the cut-off
    const cutoff = new Date(1973, 3, 6); // April 6, 1973
    const dob = new Date(birthYear, birthMonth - 1, 1);
    return dob < cutoff ? 55 : 57;
  }, [birthYear, birthMonth]);
  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });
  }, []);

  const fetchPlans = async () => {
    if (!user) return;
    const q = query(collection(db, "plans"), where("userId", "==", user.uid));
    const querySnapshot = await getDocs(q);
    const fetchedPlans = querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Plan[];
    setPlans(fetchedPlans);
  };

  useEffect(() => {
    if (user) {
      fetchPlans();
    } else {
      setPlans([]);
      setCurrentPlanId(null);
    }
  }, [user]);

  const loadPlan = (plan: Plan) => {
    if (!confirmUnsavedChanges()) return;
    setCurrentPlanId(plan.id);
    const d = plan.data;
    setPaye(d.paye);
    setSelfEmployment(d.selfEmployment);
    setTaxSettings(d.taxSettings);
    setBudgetLines(d.budgetLines);
    setAnnualBills(d.annualBills);
    setSavings(d.savings);
    setProjectionYears(d.projectionYears);
    setMortgage(d.mortgage);
    setBirthYear(d.birthYear || 1990);
    setBirthMonth(d.birthMonth || 1);
    setExpectedOutgoings(d.expectedOutgoings || 0);
    setDrawdownRate(d.drawdownRate || 4);
    setOtherRetirementIncome(d.otherRetirementIncome || []);
    setDrawdownSettings(d.drawdownSettings || {});
    setInflationRate(d.inflationRate ?? 3);
    setAdditionalRetirementExpenses(d.additionalRetirementExpenses || []);
    setRetirementTaxableFraction(d.retirementTaxableFraction ?? 0.75);
    setShowLisaUnder60(d.showLisaUnder60 ?? true);
    
    // Normalize and set lastSavedData
    setLastSavedData(JSON.stringify({
      paye: d.paye,
      selfEmployment: d.selfEmployment,
      taxSettings: d.taxSettings,
      budgetLines: d.budgetLines,
      annualBills: d.annualBills,
      savings: d.savings,
      projectionYears: d.projectionYears,
      mortgage: d.mortgage,
      birthYear: d.birthYear || 1990,
      birthMonth: d.birthMonth || 1,
      expectedOutgoings: d.expectedOutgoings || 0,
      drawdownRate: d.drawdownRate || 4,
      otherRetirementIncome: d.otherRetirementIncome || [],
      drawdownSettings: d.drawdownSettings || {},
      inflationRate: d.inflationRate ?? 3,
      additionalRetirementExpenses: d.additionalRetirementExpenses || [],
      retirementTaxableFraction: d.retirementTaxableFraction ?? 0.75,
      showLisaUnder60: d.showLisaUnder60 ?? true,
    }));
  };

  const handleSavePlan = async () => {
    if (!user) return;
    const planData = {
      paye,
      selfEmployment,
      taxSettings,
      budgetLines,
      annualBills,
      savings,
      projectionYears,
      mortgage,
      birthYear,
      birthMonth,
      expectedOutgoings,
      drawdownRate,
      otherRetirementIncome,
      drawdownSettings,
      inflationRate,
      additionalRetirementExpenses,
      retirementTaxableFraction,
    };

    if (currentPlanId) {
      const planRef = doc(db, "plans", currentPlanId);
      await updateDoc(planRef, {
        data: planData,
        updatedAt: serverTimestamp(),
      });
      setLastSavedData(JSON.stringify(planData));
      alert("Plan saved successfully!");
    } else {
      const name = prompt("Enter a name for this plan:");
      if (!name) return;
      const docRef = await addDoc(collection(db, "plans"), {
        userId: user.uid,
        name,
        data: planData,
        updatedAt: serverTimestamp(),
      });
      setCurrentPlanId(docRef.id);
      setLastSavedData(JSON.stringify(planData));
      fetchPlans();
      alert("New plan created and saved!");
    }
  };

  const createNewPlan = () => {
    if (!confirmUnsavedChanges()) return;
    setCurrentPlanId(null);
    setPaye(initialPaye);
    setSelfEmployment(initialSelfEmployment);
    setTaxSettings({
      taxCode: "1257L",
      region: "england-wales-ni",
      sippNetContribution: 8506,
    });
    setBudgetLines(initialBudget);
    setAnnualBills(initialAnnualBills);
    setSavings(initialSavings);
    setProjectionYears(10);
    setMortgage({
      amount: 0,
      annualRate: 4,
      years: 25,
      monthlyOverpayment: 0,
      oneOffMonth: 0,
      oneOffAmount: 0,
    });
    setBirthYear(1990);
    setBirthMonth(1);
    setExpectedOutgoings(0);
    setDrawdownRate(4);
    setOtherRetirementIncome([]);
    setDrawdownSettings({});
    setInflationRate(3);
    setAdditionalRetirementExpenses([]);
    setRetirementTaxableFraction(0.75);
    
    // Reset lastSavedData to the "new plan" state
    const newDataString = JSON.stringify({
      paye: initialPaye,
      selfEmployment: initialSelfEmployment,
      taxSettings: {
        taxCode: "1257L",
        region: "england-wales-ni",
        sippNetContribution: 8506,
      },
      budgetLines: initialBudget,
      annualBills: initialAnnualBills,
      savings: initialSavings,
      projectionYears: 10,
      mortgage: {
        amount: 0,
        annualRate: 4,
        years: 25,
        monthlyOverpayment: 0,
        oneOffMonth: 0,
        oneOffAmount: 0,
      },
      birthYear: 1990,
      birthMonth: 1,
      expectedOutgoings: 0,
      drawdownRate: 4,
      otherRetirementIncome: [],
      drawdownSettings: {},
      inflationRate: 3,
      additionalRetirementExpenses: [],
      retirementTaxableFraction: 0.75,
    });
    setLastSavedData(newDataString);
  };

  const handleDeletePlan = async () => {
    if (!currentPlanId || !window.confirm("Are you sure you want to delete this plan?")) return;
    const planRef = doc(db, "plans", currentPlanId);
    await deleteDoc(planRef);
    setCurrentPlanId(null);
    fetchPlans();
    alert("Plan deleted.");
    createNewPlan();
  };

  const totalSippNet = useMemo(() => {
    return savings
      .filter(s => s.type === 'pension')
      .reduce((sum, s) => sum + (clampNumber(s.monthly) * 12), 0);
  }, [savings]);

  const tax = useMemo(
    () => calculateTaxSummary(paye, selfEmployment, { ...taxSettings, sippNetContribution: totalSippNet }),
    [paye, selfEmployment, taxSettings, totalSippNet],
  );

  const savingsForBudget = useMemo(
    () => savings.filter((bucket) => !["workplace-private-pension", "nhs-pension", "civil-service-pension", "teachers-pension"].includes(bucket.type) && !bucket.isHidden),
    [savings],
  );

const projectionBuckets = useMemo(() => {
    return savings;
  }, [savings]);
  const budget = useMemo(
    () => budgetSummary(tax.monthlyNet, budgetLines, annualBills, savingsForBudget, mortgage.monthlyOverpayment),
    [tax.monthlyNet, budgetLines, annualBills, savingsForBudget, mortgage.monthlyOverpayment],
  );

  // Adjusted budget for overview to include the tax set-aside
  const monthlyTaxSetAside = tax.selfTaxTotal / 12;
  const overviewBudget = useMemo(() => {
    const monthlyOutWithTax = budget.monthlyOut + monthlyTaxSetAside;
    return {
      ...budget,
      monthlyOut: monthlyOutWithTax,
      // Surplus is what remains from cash after expenses, savings AND tax set-aside
      monthlySurplus: tax.cashMonthlyNet - monthlyOutWithTax,
    };
  }, [budget, monthlyTaxSetAside, tax.cashMonthlyNet]);

  const projectedSavings = useMemo(
  () => projectSavings(projectionBuckets, projectionYears, birthYear, drawdownSettings, inflationRate),
  [projectionBuckets, projectionYears, birthYear, drawdownSettings, inflationRate],
);
  const mortgageSummary = useMemo(() => calculateMortgage(mortgage), [mortgage]);
  const targetGross = useMemo(
    () => requiredGrossForNet(
      Math.max(0, budget.monthlyOut * 12), 
      taxSettings.taxCode, 
      taxSettings.region,
      taxSettings.includeStudentLoan,
      taxSettings.pensionRate
    ),
    [budget.monthlyOut, taxSettings],
  );
  const projectedTotal = projectedSavings.reduce((sum, bucket) => {
    return bucket.isHidden ? sum : sum + bucket.projected;
  }, 0);
  const allProjectedTotal = projectedSavings.reduce((sum, bucket) => sum + bucket.projected, 0);

  const currentAge = (new Date().getFullYear() - birthYear) + (new Date().getMonth() + 1 - birthMonth) / 12;
  const retirementAge = currentAge + projectionYears;

  const isBucketAccessible = (type: string, age: number, startWithdrawalAge?: number) => {
    if (type === 'lisa') return age >= 60;
    if (type === 'pension' || type === 'workplace-private-pension') return age >= pensionAccessAge;
    if (['nhs-pension', 'civil-service-pension', 'teachers-pension'].includes(type)) return age >= (startWithdrawalAge || 67);
    return true;
  };

  const accessibleProjectedTotal = useMemo(() => {
    return projectedSavings.reduce((sum, bucket) => {
      if (bucket.isHidden) return sum;
      // We check accessibility at the END of the projection (retirementAge)
      if (isBucketAccessible(bucket.type, retirementAge)) {
        return sum + bucket.projected;
      }
      return sum;
    }, 0);
  }, [projectedSavings, retirementAge, isBucketAccessible]);

  const nhsJobsGross = useMemo(() => {
    return paye.filter(j => j.pensionType === 'nhs').reduce((sum, j) => sum + j.gross, 0);
  }, [paye]);

  const civilServiceJobsGross = useMemo(() => {
    return paye.filter(j => j.pensionType === 'civil-service').reduce((sum, j) => sum + j.gross, 0);
  }, [paye]);

  const teachersJobsGross = useMemo(() => {
    return paye.filter(j => j.pensionType === 'teachers').reduce((sum, j) => sum + j.gross, 0);
  }, [paye]);

  const retirementSummary = useMemo(() => {
    let totalAnnualGross = 0;
    let totalAnnualTaxable = 0;

    projectedSavings.forEach((bucket) => {
      const settings = drawdownSettings[bucket.id] || { rate: 4, lumpSumTaken: false, useStopAge: false, useWithdrawAge: false, stopAge: 60, withdrawAge: 60 };
      
      let annualIncome = 0;
      let taxableIncome = 0;

      if (['nhs-pension', 'civil-service-pension', 'teachers-pension'].includes(bucket.type)) {
        const effectiveWithdrawAge = settings.useWithdrawAge ? settings.withdrawAge : (bucket.startWithdrawalAge || 67);
        if (!isBucketAccessible(bucket.type, retirementAge, effectiveWithdrawAge)) return;
        
        let salary = bucket.dbSalary || 0;
        let baseYears = (bucket.dbYearsService || 0);
        const effectiveStopAge = settings.useStopAge ? settings.stopAge : (bucket.stopContributingAge || 0);
        let yearsUntilStop = effectiveStopAge ? Math.max(0, effectiveStopAge - (birthYear + (currentAge))) : projectionYears;
        let yearsAtRetirement = baseYears + Math.min(projectionYears, yearsUntilStop);
        let accrual = 54; // Default

        if (bucket.type === 'nhs-pension') {
            salary = nhsJobsGross || bucket.nhsSalary || bucket.dbSalary || 0;
            yearsAtRetirement = (bucket.nhsYearsService || bucket.dbYearsService || 0) + Math.min(projectionYears, yearsUntilStop);
            const scheme = bucket.nhsScheme || bucket.dbScheme || "2015";
            accrual = scheme === "1995" ? 80 : scheme === "2008" ? 60 : 54;
        } else if (bucket.type === 'civil-service-pension') {
            salary = civilServiceJobsGross || bucket.dbSalary || 0;
            const scheme = bucket.dbScheme || "alpha";
            accrual = scheme === "classic" ? 80 : (scheme === "premium" || scheme === "nuvos") ? 60 : 43.1; // alpha is 2.32% or 1/43.1
        } else if (bucket.type === 'teachers-pension') {
            salary = teachersJobsGross || bucket.dbSalary || 0;
            const scheme = bucket.dbScheme || "2015";
            accrual = (scheme === "classic" || scheme === "80th") ? 80 : scheme === "60th" ? 60 : 57; // 2015 is 1/57
        }

        annualIncome = (salary / accrual) * yearsAtRetirement;
        taxableIncome = annualIncome;
      } else {
        let val = bucket.projected;
        
        // 1. Calculate the 25% penalty if it's an early LISA withdrawal
        if (bucket.type === 'lisa' && retirementAge < 60) {
          if (!showLisaUnder60) return; // Skip LISA if toggle is off
          val = val * 0.75;
        }

        // 2. Only block the pot if it's NOT a LISA and it's currently inaccessible
        if (bucket.type !== 'lisa' && !isBucketAccessible(bucket.type, retirementAge, bucket.startWithdrawalAge)) {
          return;
        }

        // Calculate annual drawdown for this specific pot
        annualIncome = val * (settings.rate / 100);
        
        // Tax logic
        if (bucket.type === 'isa' || (bucket.type === 'lisa' && retirementAge >= 60)) {
          taxableIncome = 0;
        } else if (bucket.type === 'pension' || bucket.type === 'workplace-private-pension') {
          if (settings.lumpSumTaken) {
            taxableIncome = annualIncome;
          } else {
            taxableIncome = annualIncome * 0.75; // 25% tax free
          }
        } else {
           // Default for cash or other types if any
           taxableIncome = 0; // Assuming cash is tax paid already
        }
      }

      totalAnnualGross += annualIncome;
      totalAnnualTaxable += taxableIncome;
    });

    otherRetirementIncome.forEach(item => {
      totalAnnualGross += item.amount * 12;
      if (item.isTaxable) {
        totalAnnualTaxable += item.amount * 12;
      }
    });

    const taxResult = calculateIncomeTax(totalAnnualTaxable, taxSettings.taxCode, 0, taxSettings.region);
    const totalAnnualNet = totalAnnualGross - taxResult.totalTax;
    
    // Detailed Retirement Cost Calculation
    const retiredBudgetLinesTotal = budgetLines
        .filter(l => l.includeInRetirement ?? true)
        .reduce((sum, l) => sum + (l.amount || 0), 0);
    
    const retiredAnnualBillsTotal = annualBills
        .filter(b => b.includeInRetirement ?? true)
        .reduce((sum, b) => sum + (b.amount || 0) / 12, 0);

    const additionalExpensesTotal = additionalRetirementExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);

    const currentMonthlyExpenses = retiredBudgetLinesTotal + retiredAnnualBillsTotal + additionalExpensesTotal;
    
    // Inflation Adjustment
    const inflationFactor = Math.pow(1 + (inflationRate / 100), projectionYears);
    const futureMonthlyExpenses = currentMonthlyExpenses * inflationFactor;
    const realMonthlyNetIncome = (totalAnnualNet / 12) / inflationFactor;

    return {
      annualGross: totalAnnualGross,
      annualTaxable: totalAnnualTaxable,
      annualTax: taxResult.totalTax,
      annualNet: totalAnnualNet,
      monthlyIn: totalAnnualNet / 12, // Nominal
      realMonthlyIn: realMonthlyNetIncome,
      currentMonthlyExpenses,
      futureMonthlyExpenses,
      surplus: (totalAnnualNet / 12) - futureMonthlyExpenses, // Nominal future surplus
      realSurplus: realMonthlyNetIncome - currentMonthlyExpenses,
      taxResult,
      inflationFactor
    };
  }, [projectedSavings, retirementAge, otherRetirementIncome, expectedOutgoings, drawdownSettings, pensionAccessAge, nhsJobsGross, civilServiceJobsGross, teachersJobsGross, projectionYears, taxSettings, isBucketAccessible, budget.monthlyExpenses, inflationRate, budgetLines, annualBills, additionalRetirementExpenses, showLisaUnder60]);


  
  const sections = [
    { id: "overview", title: "Overview", value: monthlyMoney.format(overviewBudget.monthlySurplus), detail: "monthly surplus" },
    { id: "income", title: "Income", value: money.format(tax.payeGross + tax.selfProfit), detail: "gross + profit" },
    { id: "budget", title: "Budget", value: monthlyMoney.format(overviewBudget.monthlyOut), detail: "monthly outflow" },
    { 
      id: "savings", 
      title: "Savings", 
      value: money.format(projectedTotal), 
      subValue: "accessible",
      detail: money.format(accessibleProjectedTotal),
    },
    { id: "mortgage", title: "Mortgage", value: `${mortgageSummary.payoffYears.toFixed(1)} yrs`, detail: "payoff estimate" },
    { id: "retirement", title: "Retirement", value: monthlyMoney.format(retirementSummary.monthlyIn), detail: `${projectionYears.toFixed(2)} year projection`},
  ] satisfies { id: SectionId; title: string; value: string; detail: string; subValue?: string; subLabel?: string }[];

  if (authLoading) return <div className="loading-screen">Loading application...</div>;
  if (!user) return <AuthScreen />;

  return (
    <main className="app-shell">
      <section className="topbar">
        <div className="topbar-row main-header">
          <div className="brand">
            <p className="eyebrow">Planning Estimator</p>
            <h1>Income Plan</h1>
          </div>
          
          <div className="sys-actions">
            <button 
              className={`icon-btn ${activeSection === 'settings' ? 'active' : 'secondary'}`} 
              onClick={() => setActiveSection(activeSection === 'settings' ? 'overview' : 'settings')}
              title="Settings"
            >
              ⚙️
            </button>
            <button className="secondary logout-btn" onClick={() => { if (confirmUnsavedChanges()) signOut(auth); }}>
              <span>Sign Out </span>
              <span className="user-email">({user.email})</span>
            </button>
          </div>
        </div>
        
        <div className="topbar-row plan-actions-row">
          <div className="plan-management">
            <select
              className="plan-selector-compact"
              value={currentPlanId || ""}
              onChange={(e) => {
                const plan = plans.find((p) => p.id === e.target.value);
                if (plan) loadPlan(plan);
              }}
            >
              <option value="" disabled>Select Plan...</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            
            <div className="button-group">
              <button className="icon-btn" onClick={handleSavePlan} title="Save Plan">💾</button>
              <button className="icon-btn secondary" onClick={createNewPlan} title="New Plan">➕</button>
              {currentPlanId && <button className="icon-btn secondary danger" onClick={handleDeletePlan} title="Delete Plan">🗑️</button>}
            </div>
          </div>
        </div>
      </section>

      <section className={`summary-grid ${activeSection !== "overview" ? "focus-mode" : ""}`}>
        <Metric label="Annual net estimate" value={money.format(tax.netAnnual)} tone="green" />
        <Metric label="Monthly net estimate" value={monthlyMoney.format(tax.monthlyNet)} />
        <Metric label="Monthly expenses" value={monthlyMoney.format(budget.monthlyExpenses)} tone="amber" />
        <Metric label="Monthly savings" value={monthlyMoney.format(budget.monthlySavings)} tone="green" />
      </section>

      <nav className={`section-cards ${activeSection !== "overview" ? "focus-mode" : ""}`} aria-label="Finance sections">
        {sections.map((section) => (
            <button
              className={activeSection === section.id ? "section-card active" : "section-card"}
              key={section.id}
              data-id={section.id}
              onClick={() => setActiveSection(section.id as SectionId)}
            >
              <span>{section.title}</span>
              <strong>{section.value}</strong>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <small>{section.detail}</small>
                {section.subValue && (
                  <small style={{ color: '#24594f', fontWeight: 800 }}>
                    {section.subValue} <span style={{ fontWeight: 400, fontSize: '0.7rem', color: '#666' }}></span>
                  </small>
                )}
              </div>
            </button>
          ))}
      </nav>

      {activeSection === "settings" ? (
        <SettingsSection 
          taxSettings={taxSettings} setTaxSettings={setTaxSettings}
          birthYear={birthYear} setBirthYear={setBirthYear}
          birthMonth={birthMonth} setBirthMonth={setBirthMonth}
          tax={tax}
        />
      ) : null}

      {activeSection === "tax" ? (
        <TaxSection tax={tax} sippNetContribution={totalSippNet} />
      ) : null}

      {activeSection === "overview" ? (
       <OverviewSection
         budget={overviewBudget}
         tax={tax}
         targetGross={targetGross}
         sippNetContribution={totalSippNet}
         taxSetAside={monthlyTaxSetAside}
         setActiveSection={setActiveSection}
         taxSettings={taxSettings}
         setTaxSettings={setTaxSettings}
       />
      ) : null}
      {activeSection === "income" ? (
        <IncomeSection
          paye={paye} setPaye={setPaye}
          selfEmployment={selfEmployment} setSelfEmployment={setSelfEmployment}
          savings={savings} setSavings={setSavings}
        />
      ) : null}

      {activeSection === "budget" ? (
        <BudgetSection
          monthlyNet={tax.monthlyNet}
          budget={budget}
          budgetLines={budgetLines}
          setBudgetLines={setBudgetLines}
          annualBills={annualBills}
          setAnnualBills={setAnnualBills}
          savings={savingsForBudget}
          mortgageOverpayment={mortgage.monthlyOverpayment}
          setActiveSection={setActiveSection}
        />
      ) : null}

      {activeSection === "savings" ? (
          <SavingsSection
            savings={savings}
            setSavings={setSavings}
            projectionYears={projectionYears}
            setProjectionYears={setProjectionYears}
            projectedSavings={projectedSavings}
            projectedTotal={projectedTotal}
            allProjectedTotal={allProjectedTotal}
            employmentPensionMonthly={tax.employmentPensionTotal / 12}
            employerPensionMonthly={tax.employerPensionTotal / 12}
            nhsJobsGross={nhsJobsGross}
            civilServiceJobsGross={civilServiceJobsGross}
            teachersJobsGross={teachersJobsGross}
            drawdownSettings={drawdownSettings}
          />
      ) : null}
      {activeSection === "mortgage" ? (
        <MortgageSection mortgage={mortgage} setMortgage={setMortgage} mortgageSummary={mortgageSummary} />
      ) : null}

      {activeSection === "retirement" ? (
        <RetirementSection
          retirementAge={retirementAge}
          setRetirementAge={(targetAge: number) => setProjectionYears(Math.max(0, targetAge - currentAge))}
          outgoings={expectedOutgoings} setOutgoings={setExpectedOutgoings}
          budgetExpenses={budget.monthlyExpenses}
          monthlySurplus={budget.monthlySurplus}
          otherIncome={otherRetirementIncome} setOtherIncome={setOtherRetirementIncome}          summary={retirementSummary}
          projectedSavings={projectedSavings}
          drawdownSettings={drawdownSettings}
          setDrawdownSettings={setDrawdownSettings}
          isBucketAccessible={isBucketAccessible}
          pensionAccessAge={pensionAccessAge}
          projectionYears={projectionYears}
          setProjectionYears={setProjectionYears}
          inflationRate={inflationRate}
          setInflationRate={setInflationRate}
          budgetLines={budgetLines}
          setBudgetLines={setBudgetLines}
          annualBills={annualBills}
          setAnnualBills={setAnnualBills}
          additionalExpenses={additionalRetirementExpenses}
          setAdditionalExpenses={setAdditionalRetirementExpenses}
          taxableFraction={retirementTaxableFraction}
          setTaxableFraction={setRetirementTaxableFraction}
          taxSettings={taxSettings}
          drawdownRate={drawdownRate}
          mortgage={mortgage}
          mortgageSummary={mortgageSummary}
          birthYear={birthYear}
          setBirthYear={setBirthYear}
          birthMonth={birthMonth}
          setBirthMonth={setBirthMonth}
          showLisaUnder60={showLisaUnder60}
          setShowLisaUnder60={setShowLisaUnder60}
          />
      ) : null}

    </main>
  );
}

function RetirementSection({
  birthYear,
  setBirthYear,
  retirementAge,
  setRetirementAge,
  outgoings,
  setOutgoings,
  budgetExpenses,
  monthlySurplus,
  otherIncome,
  setOtherIncome,
  summary,
  projectedSavings,
  drawdownSettings,
  setDrawdownSettings,
  isBucketAccessible,
  pensionAccessAge,
  projectionYears,
  setProjectionYears,
  inflationRate,
  setInflationRate,
  budgetLines,
  setBudgetLines,
  annualBills,
  setAnnualBills,
  additionalExpenses,
  setAdditionalExpenses,
  taxableFraction,
  setTaxableFraction,
  taxSettings,
  drawdownRate,
  mortgage,
  mortgageSummary,
  birthMonth,
  setBirthMonth,
  showLisaUnder60,
  setShowLisaUnder60,
}: {
  birthYear: number;
  setBirthYear: (y: number) => void;
  birthMonth: number;
  setBirthMonth: (m: number) => void;
  retirementAge: number;
  setRetirementAge: (a: number) => void;
  outgoings: number;
  setOutgoings: (o: number) => void;
  budgetExpenses: number;
  monthlySurplus: number;
  otherIncome: (ExpenseLine & { isTaxable?: boolean })[];
  setOtherIncome: React.Dispatch<React.SetStateAction<(ExpenseLine & { isTaxable?: boolean })[]>>;
  summary: any;
  projectedSavings: any[];
  drawdownSettings: any;  setDrawdownSettings: (s: any) => void;
  isBucketAccessible: (type: string, age: number) => boolean;
  pensionAccessAge: number;
  projectionYears: number;
  setProjectionYears: (y: number) => void;
  inflationRate: number;
  setInflationRate: (r: number) => void;
  budgetLines: BudgetLine[];
  setBudgetLines: React.Dispatch<React.SetStateAction<BudgetLine[]>>;
  annualBills: ExpenseLine[];
  setAnnualBills: React.Dispatch<React.SetStateAction<ExpenseLine[]>>;
  additionalExpenses: ExpenseLine[];
  setAdditionalExpenses: React.Dispatch<React.SetStateAction<ExpenseLine[]>>;
  taxableFraction: number;
  setTaxableFraction: (f: number) => void;
  taxSettings: TaxSettings;
  drawdownRate: number;
  mortgage: MortgageInputs;
  mortgageSummary: any;
  showLisaUnder60: boolean;
  setShowLisaUnder60: (s: boolean) => void;
}) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);

  const hasAnyLisa = projectedSavings.some((b: any) => b.type === 'lisa');
  const hasActiveLisa = projectedSavings.some((b: any) => b.type === 'lisa' && (drawdownSettings[b.id]?.enabled ?? true));

  const targetGrossSummary = useMemo(() => {
    // 1. Calculate Nominal Other Income Net
    let otherTaxable = 0;
    let otherGross = 0;
    otherIncome.forEach(item => {
      otherGross += item.amount * 12;
      if (item.isTaxable) otherTaxable += item.amount * 12;
    });
    
    const otherTax = calculateIncomeTax(otherTaxable, taxSettings.taxCode, 0, taxSettings.region).totalTax;
    const otherNet = otherGross - otherTax;
    
    // 2. Calculate the Gap to fund from pots
    const totalTargetNet = summary.futureMonthlyExpenses * 12;
    const netGap = Math.max(0, totalTargetNet - otherNet);
    
    const res = calculateRetirementGrossRequired(
      netGap,
      taxableFraction,
      taxSettings.taxCode,
      taxSettings.region,
      otherTaxable
    );
    
    // Calculate required pots based on drawdownRate
    const rateDecimal = drawdownRate / 100;
    const requiredPensionPot = res.grossPension / rateDecimal;
    const requiredIsaPot = res.netFromNonTaxable / rateDecimal;
    
    return { ...res, requiredPensionPot, requiredIsaPot, otherNet, otherGross, otherTax, netGap, totalTargetNet };
  }, [summary.futureMonthlyExpenses, taxableFraction, taxSettings, drawdownRate, otherIncome]);

  const actualProjectedTotals = useMemo(() => {
    let lisaPenaltyTotal = 0;
    const totals = projectedSavings.reduce((acc, bucket) => {
      let val = bucket.projected;
      if (bucket.type === 'lisa') {
        if (retirementAge < 60) {
          if (!showLisaUnder60) return acc; // Skip LISA if toggle is off
          const penalty = val * 0.25;
          lisaPenaltyTotal += penalty;
          val = val - penalty;
        }
      }

      if (['pension', 'workplace-private-pension', 'nhs-pension', 'civil-service-pension', 'teachers-pension'].includes(bucket.type)) {
        acc.pension += val;
      } else if (['isa', 'lisa', 'cash'].includes(bucket.type)) {
        acc.isaCash += val;
      }
      return acc;
    }, { pension: 0, isaCash: 0 });
    
    return { ...totals, lisaPenaltyTotal };
  }, [projectedSavings, retirementAge, showLisaUnder60]);

  const pensionSurplus = actualProjectedTotals.pension - targetGrossSummary.requiredPensionPot;
  const isaSurplus = actualProjectedTotals.isaCash - targetGrossSummary.requiredIsaPot;

  return (
    <div className="workspace">
      <section className="panel span-12">
        <h2>Retirement Settings</h2>
        <div className="settings-grid">
          <label>Target Retirement Age <input type="number" placeholder="67" value={Math.round(retirementAge) || ""} onChange={e => setRetirementAge(Number(e.target.value))} /></label>
          <label>Assumed Annual Inflation % 
            <NumberInput placeholder="3" value={inflationRate} onChange={setInflationRate} suffix="%" />
          </label>
        </div>
        {retirementAge < 60 && hasAnyLisa && (
          <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input 
              type="checkbox" 
              id="showLisaUnder60" 
              checked={showLisaUnder60} 
              onChange={e => setShowLisaUnder60(e.target.checked)} 
            />
            <label htmlFor="showLisaUnder60" style={{ fontSize: '0.9rem', color: '#666', fontWeight: 600 }}>
              Include LISA in retirement pots before age 60?
            </label>
          </div>
        )}
      </section>

      <section className="panel span-12">
        <details className="disclosure-section" open>
          <summary><h2>Retirement Funding Analysis</h2></summary>
          <div className="disclosure-content">
            <div className="notice" style={{ marginBottom: '16px' }}>
              Select which current expenses and annual bills will continue into retirement.
            </div>
            
            <details style={{ marginBottom: '16px', border: '1px solid #eee', borderRadius: '8px' }}>
              <summary style={{ padding: '12px', fontSize: '0.85rem', fontWeight: 600, color: '#666', background: '#fafafa', borderRadius: '8px', cursor: 'pointer' }}>
                View/Edit Retirement Expense List ({budgetLines.length + annualBills.length + additionalExpenses.length} items)
              </summary>
              <div className="budget-lines" style={{ maxHeight: '300px', overflowY: 'auto', padding: '12px' }}>
                <h4 style={{ margin: '0 0 10px 0', fontSize: '0.8rem', color: '#666' }}>MONTHLY EXPENSES</h4>
                {budgetLines.map((line: any) => (
                  <div key={line.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 0', borderBottom: '1px solid #f9f9f9' }}>
                    <input 
                      type="checkbox" 
                      checked={line.includeInRetirement ?? true} 
                      onChange={(e) => setBudgetLines(updateItem(budgetLines, line.id, { includeInRetirement: e.target.checked }))} 
                    />
                    <span style={{ flex: 1 }}>{line.label} <small style={{ color: '#888' }}>({line.bucket})</small></span>
                    <strong style={{ minWidth: '80px', textAlign: 'right' }}>{monthlyMoney.format(line.amount)}</strong>
                  </div>
                ))}

                <h4 style={{ margin: '20px 0 10px 0', fontSize: '0.8rem', color: '#666' }}>ANNUAL BILLS</h4>
                {annualBills.map((bill: any) => (
                  <div key={bill.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 0', borderBottom: '1px solid #f9f9f9' }}>
                    <input 
                      type="checkbox" 
                      checked={bill.includeInRetirement ?? true} 
                      onChange={(e) => setAnnualBills(updateItem(annualBills, bill.id, { includeInRetirement: e.target.checked }))} 
                    />
                    <span style={{ flex: 1 }}>{bill.label}</span>
                    <strong style={{ minWidth: '80px', textAlign: 'right' }}>{monthlyMoney.format(bill.amount / 12)} <small style={{ fontWeight: 400, color: '#888' }}>/mo</small></strong>
                  </div>
                ))}

                <h4 style={{ margin: '20px 0 10px 0', fontSize: '0.8rem', color: '#24594f', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  ADDITIONAL RETIREMENT COSTS
                  <button 
                    onClick={() => setAdditionalExpenses([...additionalExpenses, { id: uid(), label: "New Future Cost", amount: 0, bucket: 'living' }])}
                    style={{ fontSize: '0.7rem', height: '24px', minHeight: 'auto', padding: '0 8px' }}
                  >
                    + Add
                  </button>
                </h4>
                {additionalExpenses.map((item: any) => (
                  <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 0', borderBottom: '1px solid #f9f9f9' }}>
                    <input type="checkbox" checked readOnly style={{ opacity: 0.5 }} />
                    <div style={{ flex: 1 }}>
                      <TextInput placeholder="e.g. Travel" value={item.label} onChange={(l) => setAdditionalExpenses(updateItem(additionalExpenses, item.id, { label: l }))} />
                    </div>
                    <div style={{ width: '100px' }}>
                      <NumberInput placeholder="0" value={item.amount} onChange={(a) => setAdditionalExpenses(updateItem(additionalExpenses, item.id, { amount: a }))} />
                    </div>
                    <button className="delete-btn" onClick={() => setAdditionalExpenses(additionalExpenses.filter((i: any) => i.id !== item.id))}>×</button>
                  </div>
                ))}
              </div>
            </details>

            <div className="callout neutral" style={{ marginTop: '16px' }}>
              <ResultRows rows={[
                ["Total Selected (Today's Money)", summary.currentMonthlyExpenses],
                [`Adjusted for Inflation (${projectionYears.toFixed(2)} yrs)`, summary.futureMonthlyExpenses],
              ]} />
              
              <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px dashed #ccc' }}>
                  <div className="funding-split-container" style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '16px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.85rem', color: '#666', fontWeight: 600, minWidth: '90px' }}>Funding Split:</span>
                    <div style={{ flex: '1 1 300px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ flex: 1, position: 'relative' }}>
                        <input 
                          type="range" min="0" max="1" step="0.01" 
                          className="split-slider"
                          value={taxableFraction} 
                          onChange={e => setTaxableFraction(Number(e.target.value))}
                          style={{ '--split-percent': `${taxableFraction * 100}%` } as any}
                        />
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', fontWeight: 800, marginTop: '4px' }}>
                          <span className="pension-text">PENSION (TAXABLE)</span>
                          <span className="isa-text">ISA / CASH (TAX FREE)</span>
                        </div>
                      </div>
                      <div style={{ width: '80px' }}>
                        <NumberInput 
                          value={Math.round(taxableFraction * 100)} 
                          onChange={(v) => setTaxableFraction(clampNumber(v, 0) / 100)} 
                          suffix="%" 
                        />
                      </div>
                    </div>
                  </div>
                  
                  <div className="notice" style={{ maxWidth: 'none', fontSize: '0.75rem', marginBottom: '12px' }}>
                    Taxable portion assumes 25% tax-free (Pension rules). Non-taxable assumes 0% tax (ISA/Cash).
                  </div>

                  <ResultRows rows={[
                    ["Target Annual Net", targetGrossSummary.totalTargetNet],
                    ["Other Income Net", -targetGrossSummary.otherNet],
                    ["Net Gap to Fund", targetGrossSummary.netGap],
                    ["Required Annual Gross Withdrawal", targetGrossSummary.totalGrossAnnual],
                    ["Estimated Annual Tax on Pots", -targetGrossSummary.totalAnnualTaxOnPots],
                  ]} />
                  <div style={{ marginTop: '12px', fontSize: '0.75rem', color: '#888', fontStyle: 'italic' }}>
                    * The <strong>Required Annual Gross Withdrawal</strong> accounts for your Other Income sources. It ensures you withdraw enough gross pension to reach your target net *after* combined tax is applied.
                  </div>
                  
                  <div style={{ marginTop: '12px', fontSize: '0.8rem', color: '#666' }}>
                    To fund the <strong>{money.format(targetGrossSummary.netGap)}</strong> gap at a <strong>{drawdownRate}%</strong> drawdown rate:
                  </div>

                  <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px dashed #ccc' }}>
                    <button 
                      className={`wide-action ${isAnalyzing ? 'loading' : ''}`}
                      disabled={isAnalyzing}
                      onClick={async () => {
                        setIsAnalyzing(true);
                        setAnalysisResult(null);
                        const snapshot = getFinancialSnapshot(birthYear, birthMonth, retirementAge, budgetExpenses, monthlySurplus, mortgageSummary, mortgage, projectedSavings, otherIncome);

                        try {
                          const model = getGenerativeModel(ai, { model: 'gemini-2.5-flash' });
                          const prompt = `
                            You are a senior UK retirement strategist. Perform a detailed retirement timeline analysis based on the provided financial snapshot.

                            Your primary goals:
                            1. **Earliest Retirement Age**: Determine the absolute earliest age the user can retire. To do this, analyze:
                               - Drawdown pots (ISAs, SIPPs, etc.) and their projected growth.
                               - Retirement expenses and additional expenses.
                               - Guaranteed income: State Pension, NHS/Teachers/Civil Service pensions, and other income streams.
                               - The required drawdown rate (currently ${drawdownRate}%).
                            2. **Savings Strategy**: Analyze their current monthly surplus of ${money.format(monthlySurplus)}. 
                               - Suggest how investing this surplus (e.g., into a SIPP for tax relief or a Stocks & Shares ISA for accessibility) could accelerate their retirement.
                               - Provide a specific "What if" scenario (e.g., "If you invest £100/mo of your surplus into an ISA at 6% growth...").
                            3. **Retirement Timeline & Bridge Strategy**: Create a step-by-step timeline explaining how to fund retirement expenses. 
                               - Explain the sequence of pot drawdowns (e.g., Bridge from ISA until Pension access, then State Pension).
                            4. **Mortgage Influence**: ${mortgage.amount > 0 ? `The user has a mortgage. Confirm if it is paid off by your proposed retirement age and how the ${money.format(mortgageSummary.standardPayment)}/mo payment (and any overpayments) affects their strategy.` : "The user has no mortgage information provided; do not mention mortgages."}

                            Snapshot Data: ${JSON.stringify(snapshot)}

                            Rules: 
                            - Use **bold** for all currency and age figures.
                            - Be specific, analytical, and encouraging.
                            - Focus on the "Earliest Possible" scenario vs the "Current Plan".
                          `;

                          const result = await model.generateContent(prompt);
                          setAnalysisResult(result.response.text());
                        } catch (e: any) {
                          console.error(e);
                          setAnalysisResult("Analysis failed: " + e.message);
                        } finally {
                          setIsAnalyzing(false);
                        }
                      }}
                    >
                      {isAnalyzing ? "🤖 Strategy Engine Analysing..." : "✨ Analyze Retirement Strategy"}
                    </button>

                    {analysisResult && (
                      <div className="callout ai-result" style={{ marginTop: '16px', padding: '20px', textAlign: 'left', lineHeight: '1.6' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', alignItems: 'center' }}>
                          <h3 style={{ margin: 0, fontSize: '0.9rem', color: '#24594f', letterSpacing: '0.05em' }}>AI RETIREMENT STRATEGY</h3>
                          <button 
                            onClick={() => setAnalysisResult(null)}
                            style={{ background: '#eee', color: '#666', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.7rem' }}
                          >
                            Dismiss
                          </button>
                        </div>
                        <div className="markdown-content" style={{ fontSize: '0.85rem', color: '#333' }}>
                          {analysisResult.split('\n').map((line, i) => (
                            <p key={i} style={{ margin: '4px 0' }}>{line}</p>
                          ))}
                        </div>
                      </div>
                    )}                    <div className="retirement-comparison-grid">                      <div className={`metric pension-card ${pensionSurplus >= 0 ? 'green' : 'red'}`} style={{ minHeight: 'auto', padding: '12px' }}>
                        <span style={{ fontSize: '0.75rem' }}>Projected Pension Pot</span>
                        <strong style={{ fontSize: '1.2rem' }}>{money.format(actualProjectedTotals.pension)}</strong>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                          <small style={{ fontSize: '0.65rem', color: '#666' }}>Target: {money.format(targetGrossSummary.requiredPensionPot)}</small>
                          <small style={{ fontSize: '0.7rem', fontWeight: 800 }}>
                            {pensionSurplus >= 0 ? '+' : ''}{money.format(pensionSurplus)}
                          </small>
                        </div>
                      </div>
                      <div className={`metric isa-card ${isaSurplus >= 0 ? 'green' : 'red'}`} style={{ minHeight: 'auto', padding: '12px' }}>
                        <span style={{ fontSize: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          Projected ISA/Cash Pot
                          {actualProjectedTotals.lisaPenaltyTotal > 0 && (
                            <small style={{ color: '#a7332f', fontWeight: 800, fontSize: '0.6rem' }}>
                              LISA PENALTY: -{money.format(actualProjectedTotals.lisaPenaltyTotal)}
                            </small>
                          )}
                        </span>
                        <strong style={{ fontSize: '1.2rem' }}>{money.format(actualProjectedTotals.isaCash)}</strong>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                          <small style={{ fontSize: '0.65rem', color: '#666' }}>Target: {money.format(targetGrossSummary.requiredIsaPot)}</small>
                          <small style={{ fontSize: '0.7rem', fontWeight: 800 }}>
                            {isaSurplus >= 0 ? '+' : ''}{money.format(isaSurplus)}
                          </small>
                        </div>
                      </div>
                    </div>
                  </div>
              </div>
            </div>
          </div>
        </details>
      </section>

      <section className="panel span-12">
        <details className="disclosure-section">
          <summary><h2>Drawdown Strategy & Pots</h2></summary>
          <div className="disclosure-content">
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
              <span style={{ fontSize: '0.9rem', color: '#666' }}>Projection Period:</span>
              <div style={{ width: '100px' }}>
                <NumberInput placeholder="10" value={projectionYears} onChange={setProjectionYears} suffix="yrs" />
              </div>
            </div>
          
            <div className="table retirement-table">
              <div className="table-row header">
                <span>Pot</span>
                <span title="Tick if 25% tax-free lump sum already taken">Lump Sum?</span>
                <span>Rate %</span>
                <span>Stop Contrib Age</span>
                <span>Withdrawal Age</span>
              </div>
              {projectedSavings.map((bucket: any) => {
                const accessible = isBucketAccessible(bucket.type, retirementAge);
                const isPension = bucket.type === 'pension' || bucket.type === 'workplace-pension' || bucket.type === 'workplace-private-pension';
                const settings = drawdownSettings[bucket.id] || { rate: 4, lumpSumTaken: false, useStopAge: false, useWithdrawAge: false, stopAge: 60, withdrawAge: 60 };
                
                return (
                  <div className={`table-row ${!accessible ? "deselected" : ""}`} key={bucket.id}>
                    <div>
                      <div className="mobile-label">Pot</div>
                      <span>{bucket.label}</span>
                      {!accessible && <small style={{ display: 'block', color: '#a7332f' }}>Locked until age {bucket.type === 'lisa' ? 60 : bucket.type === 'nhs-pension' ? 67 : pensionAccessAge}</small>}
                    </div>
                    <div>
                      <div className="mobile-label">Lump Sum?</div>
                      {isPension ? (
                        <input
                          type="checkbox"
                          checked={settings.lumpSumTaken ?? false}
                          onChange={() => {
                            setDrawdownSettings({ ...drawdownSettings, [bucket.id]: { ...settings, lumpSumTaken: !settings.lumpSumTaken } });
                          }}
                        />
                      ) : (
                        <span style={{ color: '#ccc', fontSize: '0.8rem' }}>N/A</span>
                      )}
                    </div>
                    <div>
                      <div className="mobile-label">Rate %</div>
                      {bucket.type === 'nhs-pension' ? (
                        <span style={{ fontSize: '0.8rem', color: '#2c5282' }}>Defined Benefit (Fixed)</span>
                      ) : (
                        <NumberInput 
                          placeholder="4"
                          value={settings.rate ?? 4} 
                          onChange={(rate) => {
                            setDrawdownSettings({ ...drawdownSettings, [bucket.id]: { ...settings, rate } });
                          }}
                          suffix="%" 
                        />
                      )}
                    </div>
                    <div>
                      <div className="mobile-label">Stop Contrib Age</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <input 
                          type="checkbox" 
                          checked={settings.useStopAge} 
                          onChange={(e) => setDrawdownSettings({...drawdownSettings, [bucket.id]: {...settings, useStopAge: e.target.checked}})} 
                        />
                        {settings.useStopAge && (
                          <div className="age-input-container" style={{ width: '60px' }}>
                            <NumberInput value={settings.stopAge} onChange={(val) => setDrawdownSettings({...drawdownSettings, [bucket.id]: {...settings, stopAge: val}})} />
                          </div>
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="mobile-label">Withdrawal Age</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <input 
                          type="checkbox" 
                          checked={settings.useWithdrawAge} 
                          onChange={(e) => setDrawdownSettings({...drawdownSettings, [bucket.id]: {...settings, useWithdrawAge: e.target.checked}})} 
                        />
                        {settings.useWithdrawAge && (
                          <div className="age-input-container" style={{ width: '60px' }}>
                            <NumberInput value={settings.withdrawAge} onChange={(val) => setDrawdownSettings({...drawdownSettings, [bucket.id]: {...settings, withdrawAge: val}})} />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </details>
      </section>

      <section className="panel span-12">
        <details className="disclosure-section">
          <summary>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
              <h2>Other Income Sources</h2>
              <button 
                onClick={(e) => { e.stopPropagation(); setOtherIncome([...otherIncome, {id: uid(), label: "Other Income", amount: 0, isTaxable: true, bucket: 'living'}]) }}
                style={{ 
                  fontSize: '0.7rem', 
                  height: '24px', 
                  minHeight: 'auto', 
                  padding: '0 10px',
                  display: 'inline-flex',    /* Vertically centers text inside tight spaces */
                  alignItems: 'center',      /* Aligns text perfectly in the middle */
                  justifyContent: 'center',  /* Horizontally centers it */
                  whiteSpace: 'nowrap',      /* Guarantees "+ Add Source" stays on one line */
                  lineHeight: '1'            /* Eliminates default font padding issues */
                }}
              >
                + Add Source
              </button>
            </div>
          </summary>
          <div className="disclosure-content">
            <div className="budget-lines">
              <div className="budget-row header desktop-only">
                <span>Source</span>
                <span>Monthly Amount</span>
                <span>Taxable?</span>
                <span></span>
              </div>
              {otherIncome.map((item: any) => (
                <div key={item.id} className="budget-row">
                  <div><div className="mobile-label">Source</div><TextInput placeholder="e.g. Rental Income" value={item.label} onChange={(l) => setOtherIncome(updateItem<any>(otherIncome, item.id, { label: l }))} /></div>
                  <div><div className="mobile-label">Monthly Gross Amount</div><NumberInput placeholder="0" value={item.amount} onChange={(a) => setOtherIncome(updateItem<any>(otherIncome, item.id, { amount: a }))} /></div>
                  <div>
                    <div className="mobile-label">Taxable?</div>
                    <input 
                      type="checkbox" 
                      checked={item.isTaxable ?? false} 
                      onChange={(e) => setOtherIncome(updateItem<any>(otherIncome, item.id, { isTaxable: e.target.checked }))} 
                    />
                  </div>
                  <button className="delete-btn" onClick={() => setOtherIncome(otherIncome.filter((i: any) => i.id !== item.id))}>×</button>
                </div>
              ))}
            </div>
          </div>
        </details>
      </section>

      <section className="panel span-6">
        <h2>Post-Retirement Income Summary</h2>
        <ResultRows rows={[
          ["Monthly Net (Nominal)", summary.monthlyIn],
          ["Monthly Net (Today's Money)", summary.realMonthlyIn],
          ["Future Monthly Costs", -summary.futureMonthlyExpenses],
          ["Monthly Surplus (Future)", summary.surplus],
          ["Real Surplus (Today's Money)", summary.realSurplus],
        ]} />
        <div style={{ marginTop: '16px', fontSize: '0.85rem', color: '#666', borderTop: '1px solid #eee', paddingTop: '12px' }}>
            <p><strong>Note:</strong> "Today's Money" accounts for your assumed {inflationRate}% inflation over {projectionYears.toFixed(2)} years.</p>
        </div>
        {hasActiveLisa && retirementAge < 60 && showLisaUnder60 && (
          <p style={{color: '#a7332f', fontSize: '0.85rem', marginTop: '10px', fontWeight: 600}}>
            * LISA 25% penalty applied: -{money.format(actualProjectedTotals.lisaPenaltyTotal)} total reduction.
          </p>
        )}
        {hasActiveLisa && retirementAge < 60 && !showLisaUnder60 && (
          <p style={{color: '#666', fontSize: '0.8rem', marginTop: '10px', fontStyle: 'italic'}}>
            * LISA pots are currently excluded from retirement projections (Retiring before 60).
          </p>
        )}
      </section>

      <section className="panel span-6">
        <DepletionChart 
          projectedSavings={projectedSavings} 
          drawdownSettings={drawdownSettings} 
          retirementAge={retirementAge} 
          pensionAccessAge={pensionAccessAge} 
        />
      </section>
    </div>
  );
}

function OverviewSection({
  budget,
  tax,
  targetGross,
  sippNetContribution,
  taxSetAside,
  setActiveSection,
  taxSettings,
  setTaxSettings,
}: {
  budget: any;
  tax: ReturnType<typeof calculateTaxSummary>;
  targetGross: number;
  sippNetContribution: number;
  taxSetAside: number;
  setActiveSection: (section: SectionId) => void;
  taxSettings: TaxSettings;
  setTaxSettings: (s: TaxSettings) => void;
}) {
  const [showPensionInput, setShowPensionInput] = useState(!!taxSettings.pensionRate);

  return (
    <div className="workspace overview-workspace">
      <section className="panel span-8">
        <h2>Current Plan</h2>
        <ResultRows
          rows={[
            ["Monthly income (cash)", tax.cashMonthlyNet],
            ["Tax set-aside", -taxSetAside],
            ["Monthly expenses", -budget.monthlyExpenses],
            ["Monthly savings", -budget.monthlySavings],
            ["Monthly surplus", budget.monthlySurplus],
            ["Gross income needed for current plan", targetGross],
          ]}
        />
        
        <div className="calculation-settings" style={{ marginTop: '20px', padding: '16px', backgroundColor: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
          <h4 style={{ margin: '0 0 12px 0', fontSize: '0.9rem', color: '#374151' }}>Calculation Options</h4>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', cursor: 'pointer' }}>
              <input 
                type="checkbox" 
                checked={taxSettings.includeStudentLoan} 
                onChange={(e) => setTaxSettings({ ...taxSettings, includeStudentLoan: e.target.checked })}
              />
              Include Student Loan (Plan 2)
            </label>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', cursor: 'pointer' }}>
                <input 
                  type="checkbox" 
                  checked={showPensionInput} 
                  onChange={(e) => {
                    setShowPensionInput(e.target.checked);
                    if (!e.target.checked) setTaxSettings({ ...taxSettings, pensionRate: 0 });
                  }}
                />
                Include Pension Deduction
              </label>
              
              {showPensionInput && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <NumberInput 
                    value={taxSettings.pensionRate || 0} 
                    onChange={(v) => setTaxSettings({ ...taxSettings, pensionRate: v })}
                    suffix="%"
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        <div style={{ marginTop: '16px', fontSize: '0.85rem', color: '#666', borderTop: '1px solid #eee', paddingTop: '12px' }}>
          <p><strong>Note:</strong> Gross income calculation includes Income Tax and National Insurance deductions, plus any optional deductions selected above.</p>
        </div>
      </section>
      <section className="panel span-4">
        <h2>SIPP threshold check</h2>
        {tax.sippNetNeededToReach100k > 0 ? (
          <div className="callout amber">
            <strong>{money.format(tax.sippGrossNeededToReach100k)} gross</strong>
            <span>
              extra gross SIPP contribution estimated to bring adjusted net income to GBP 100,000. You would normally
              pay about {money.format(tax.sippNetNeededToReach100k)} net into a relief-at-source SIPP. Current net SIPP
              input is {money.format(sippNetContribution)}.
            </span>
          </div>
        ) : (
          <p style={{ margin: '14px 0', fontSize: '0.9rem', color: '#66736c' }}>
            Adjusted net income is below £100,000.
          </p>
        )}
        <button className="wide-action" onClick={() => setActiveSection("tax")}>Open tax settings</button>
      </section>
    </div>
  );
}

function updateExpense(streamId: string, expenseId: string, patch: any, selfEmployment: any[], setSelfEmployment: any) {
  setSelfEmployment(selfEmployment.map((s: any) => s.id === streamId ? {
    ...s,
    expenses: s.expenses.map((e: any) => e.id === expenseId ? { ...e, ...patch } : e)
  } : s));
}

function IncomeSection({
  paye,
  setPaye,
  selfEmployment,
  setSelfEmployment,
  savings,
  setSavings,
}: {
  paye: PayeIncome[];
  setPaye: React.Dispatch<React.SetStateAction<PayeIncome[]>>;
  selfEmployment: SelfEmployment[];
  setSelfEmployment: React.Dispatch<React.SetStateAction<SelfEmployment[]>>;
  savings: SavingsBucket[];
  setSavings: React.Dispatch<React.SetStateAction<SavingsBucket[]>>;
}) {
  const hasNhsJob = paye.some(j => j.pensionType === 'nhs');
  const hasCivilServiceJob = paye.some(j => j.pensionType === 'civil-service');
  const hasTeachersJob = paye.some(j => j.pensionType === 'teachers');

  const nhsBucket = savings.find(s => s.type === 'nhs-pension');
  const civilServiceBucket = savings.find(s => s.type === 'civil-service-pension');
  const teachersBucket = savings.find(s => s.type === 'teachers-pension');

  const nhsJobsGross = paye.filter(j => j.pensionType === 'nhs').reduce((sum, j) => sum + j.gross, 0);
  const civilServiceJobsGross = paye.filter(j => j.pensionType === 'civil-service').reduce((sum, j) => sum + j.gross, 0);
  const teachersJobsGross = paye.filter(j => j.pensionType === 'teachers').reduce((sum, j) => sum + j.gross, 0);

  const ensureNhsBucket = () => {
    if (!nhsBucket) {
      setSavings([...savings, { id: uid(), label: "NHS Pension", balance: 0, monthly: 0, annualRate: 0, type: "nhs-pension", dbScheme: "2015", dbYearsService: 0 }]);
    }
  };

  const ensureCivilServiceBucket = () => {
    if (!civilServiceBucket) {
      setSavings([...savings, { id: uid(), label: "Civil Service Pension", balance: 0, monthly: 0, annualRate: 0, type: "civil-service-pension", dbScheme: "alpha", dbYearsService: 0 }]);
    }
  };

  const ensureTeachersBucket = () => {
    if (!teachersBucket) {
      setSavings([...savings, { id: uid(), label: "Teachers' Pension", balance: 0, monthly: 0, annualRate: 0, type: "teachers-pension", dbScheme: "2015", dbYearsService: 0 }]);
    }
  };

  const ensureWorkplacePensionBucket = (job: PayeIncome) => {
    if (!savings.find(s => s.id === job.id)) {
      setSavings([...savings, { 
        id: job.id, 
        label: job.label + " Pension", 
        balance: 0, 
        monthly: (job.gross * ((job.pensionRate || 0) + (job.employerPensionContribution || 0))) / 1200, 
        annualRate: 4, 
        type: "workplace-private-pension" 
      }]);
    }
  };

  return (
    <div className="workspace">
      <section className="panel span-12">
        <PanelHeader
          title="PAYE Income"
          actionLabel="Add PAYE"
          onAction={() =>
            setPaye([...paye, { id: uid(), label: "New PAYE job", gross: 0, pensionRate: 0, employerPensionContribution: 0, pensionType: "" as any }])
          }
        />
        <div className="table income-table">
          <div className="table-row header">
            <span>PAYE income</span>
            <span>Gross</span>
            <span>Pension Type</span>
            <span>Employee pension %</span>
            <span>Employer pension %</span>
            <span></span>
          </div>
          {paye.map((income) => (
            <div className="table-row" key={income.id}>
              <div><div className="mobile-label">Source</div><TextInput placeholder="e.g. Main Job" value={income.label} onChange={(label) => {
                  setPaye(updateItem(paye, income.id, { label }));
                  if (income.pensionType === 'standard') {
                    setSavings(savings.map(s => s.id === income.id ? {...s, label: label + " Pension"} : s));
                  }
              }} /></div>
              <div><div className="mobile-label">Gross</div><NumberInput placeholder="0" value={income.gross} onChange={(gross) => {
                const patch: any = { gross };
                if (income.pensionType === 'nhs') {
                   patch.pensionRate = calculateNhsEmployeeRate(gross);
                   patch.employerPensionContribution = (gross * NHS_EMPLOYER_RATE) / 100;
                } else if (income.pensionType === 'standard') {
                    const monthly = (gross * ((income.pensionRate || 0) + (income.employerPensionContribution || 0))) / 1200;
                    setSavings(savings.map(s => s.id === income.id ? {...s, monthly} : s));
                }
                setPaye(updateItem(paye, income.id, patch));
              }} /></div>
              <div>
                <div className="mobile-label">Pension Type</div>
                <select value={income.pensionType || ""} onChange={(e) => {
                  const val = e.target.value as any;
                  const patch: any = { pensionType: val };
                  if (val === 'nhs') {
                    patch.pensionRate = calculateNhsEmployeeRate(income.gross);
                    patch.employerPensionContribution = (income.gross * NHS_EMPLOYER_RATE) / 100;
                    ensureNhsBucket();
                  } else if (val === 'standard') {
                    ensureWorkplacePensionBucket(income);
                  } else if (val === 'civil-service') {
                    ensureCivilServiceBucket();
                  } else if (val === 'teachers') {
                    ensureTeachersBucket();
                  }
                  setPaye(updateItem(paye, income.id, patch));
                }}>
                  <option value="" disabled>--select--</option>
                  <option value="standard">Standard</option>
                  <option value="nhs">NHS</option>
                  <option value="civil-service">Civil Service</option>
                  <option value="teachers">Teachers</option>
                </select>

              </div>
              <div><div className="mobile-label">Employee Pension %</div><NumberInput placeholder="0" value={income.pensionRate} onChange={(pensionRate) => {
                  setPaye(updateItem(paye, income.id, { pensionRate }));
                  if (income.pensionType === 'standard') {
                      const monthly = (income.gross * (pensionRate + (income.employerPensionContribution || 0))) / 1200;
                      setSavings(savings.map(s => s.id === income.id ? {...s, monthly} : s));
                  }
              }} suffix="%" /></div>
              <div><div className="mobile-label">Employer Pension %</div><NumberInput placeholder="0" value={income.employerPensionContribution} onChange={(employerPensionContribution) => {
                  setPaye(updateItem(paye, income.id, { employerPensionContribution }));
                  if (income.pensionType === 'standard') {
                      const monthly = (income.gross * ((income.pensionRate || 0) + employerPensionContribution)) / 1200;
                      setSavings(savings.map(s => s.id === income.id ? {...s, monthly} : s));
                  }
              }} suffix="%" /></div>
              <button className="delete-btn" onClick={() => setPaye(paye.filter((i: any) => i.id !== income.id))}>×</button>
            </div>
          ))}
        </div>
      </section>

      {hasNhsJob && (
        <section className="panel span-12" style={{ background: '#f0f7ff', border: '2px dashed #3182ce' }}>
          <div className="split-title">
            <h2>NHS Pension Configuration</h2>
            <div className="notice" style={{ maxWidth: 'none', border: 'none', padding: 0 }}>
              Based on your NHS job(s), we need a few more details to estimate your retirement income.
            </div>
          </div>
          {nhsBucket ? (
            <div className="settings-grid">
              <label>Total Years of Service (to date) 
                <NumberInput placeholder="0" value={nhsBucket.nhsYearsService || 0} onChange={(val) => setSavings(updateItem(savings, nhsBucket.id, { nhsYearsService: val }))} />
              </label>
              <label>Pension Scheme
                <select value={nhsBucket.nhsScheme || "2015"} onChange={(e) => setSavings(updateItem(savings, nhsBucket.id, { nhsScheme: e.target.value as any }))}>
                  <option value="1995">1995 Scheme (1/80)</option>
                  <option value="2008">2008 Scheme (1/60)</option>
                  <option value="2015">2015 Scheme (1/54)</option>
                </select>
              </label>
              <div style={{ gridColumn: 'span 2', fontSize: '0.85rem', color: '#4a5568', marginTop: '10px' }}>
                <strong>Projected Annual Income:</strong> The system will use your combined NHS job salary ({money.format(nhsJobsGross)}) 
                and project it forward until your retirement at age 67.
              </div>
            </div>
          ) : (
            <button onClick={ensureNhsBucket}>Initialize NHS Pension Bucket</button>
          )}
        </section>
      )}

      {hasCivilServiceJob && (
        <section className="panel span-12" style={{ background: '#f6f1ff', border: '2px dashed #805ad5' }}>
          <div className="split-title">
            <h2>Civil Service Pension Configuration</h2>
            <div className="notice" style={{ maxWidth: 'none', border: 'none', padding: 0 }}>
              Provide details for your Civil Service pension estimation.
            </div>
          </div>
          {civilServiceBucket ? (
            <div className="settings-grid">
              <label>Total Years of Service (to date) 
                <NumberInput placeholder="0" value={civilServiceBucket.dbYearsService || 0} onChange={(val) => setSavings(updateItem(savings, civilServiceBucket.id, { dbYearsService: val }))} />
              </label>
              <label>Pension Scheme
                <select value={civilServiceBucket.dbScheme || "alpha"} onChange={(e) => setSavings(updateItem(savings, civilServiceBucket.id, { dbScheme: e.target.value as any }))}>
                  <option value="alpha">Alpha (2.32%)</option>
                  <option value="classic">Classic (1/80)</option>
                  <option value="premium">Premium/Nuvos (1/60)</option>
                </select>
              </label>
              <div style={{ gridColumn: 'span 2', fontSize: '0.85rem', color: '#4a5568', marginTop: '10px' }}>
                <strong>Projected Annual Income:</strong> The system will use your combined Civil Service salary ({money.format(civilServiceJobsGross)}) 
                and project it forward until your retirement at age 67.
              </div>
            </div>
          ) : (
            <button onClick={ensureCivilServiceBucket}>Initialize Civil Service Pension Bucket</button>
          )}
        </section>
      )}

      {hasTeachersJob && (
        <section className="panel span-12" style={{ background: '#fff5f5', border: '2px dashed #e53e3e' }}>
          <div className="split-title">
            <h2>Teachers' Pension Configuration</h2>
            <div className="notice" style={{ maxWidth: 'none', border: 'none', padding: 0 }}>
              Provide details for your Teachers' pension estimation.
            </div>
          </div>
          {teachersBucket ? (
            <div className="settings-grid">
              <label>Total Years of Service (to date) 
                <NumberInput placeholder="0" value={teachersBucket.dbYearsService || 0} onChange={(val) => setSavings(updateItem(savings, teachersBucket.id, { dbYearsService: val }))} />
              </label>
              <label>Pension Scheme
                <select value={teachersBucket.dbScheme || "2015"} onChange={(e) => setSavings(updateItem(savings, teachersBucket.id, { dbScheme: e.target.value as any }))}>
                  <option value="2015">TPS 2015 (1/57)</option>
                  <option value="classic">TPS Final Salary (1/80)</option>
                  <option value="60th">TPS Final Salary (1/60)</option>
                </select>
              </label>
              <div style={{ gridColumn: 'span 2', fontSize: '0.85rem', color: '#4a5568', marginTop: '10px' }}>
                <strong>Projected Annual Income:</strong> The system will use your combined Teachers salary ({money.format(teachersJobsGross)}) 
                and project it forward until your retirement at age 67.
              </div>
            </div>
          ) : (
            <button onClick={ensureTeachersBucket}>Initialize Teachers' Pension Bucket</button>
          )}
        </section>
      )}

      <section className="panel span-12">
        <PanelHeader
          title="Self-employed Income"
          actionLabel="Add stream"
          onAction={() => setSelfEmployment([...selfEmployment, { id: uid(), label: "New stream", gross: 0, expenses: [] }])}
        />
        <div className="stream-grid">
          {selfEmployment.map((stream) => {
            const expenses = stream.expenses.reduce((sum, expense) => sum + expense.amount, 0);
            return (
              <article className="mini-panel" key={stream.id}>
                <div className="split-title">
                  <TextInput placeholder="e.g. Freelancing" value={stream.label} onChange={(label) => setSelfEmployment(updateItem(selfEmployment, stream.id, { label }))} />
                  <button className="delete-btn" onClick={() => setSelfEmployment(selfEmployment.filter((s: any) => s.id !== stream.id))}>×</button>
                </div>
                <label>
                  Gross income
                  <NumberInput placeholder="0" value={stream.gross} onChange={(gross) => setSelfEmployment(updateItem(selfEmployment, stream.id, { gross }))} />
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', margin: '8px 0' }}>
                  <input 
                    type="checkbox" 
                    checked={stream.isNiLiable ?? true} 
                    onChange={(e) => setSelfEmployment(updateItem(selfEmployment, stream.id, { isNiLiable: e.target.checked }))} 
                  />
                  Liable to National Insurance?
                </label>
                <div className="expense-list">
                  {stream.expenses.map((expense) => (
                    <div className="expense-row" key={expense.id}>
                      <TextInput
                        placeholder="Expense label"
                        value={expense.label}
                        onChange={(label) => updateExpense(stream.id, expense.id, { label }, selfEmployment, setSelfEmployment)}
                      />
                      <NumberInput
                        placeholder="0"
                        value={expense.amount}
                        onChange={(amount) => updateExpense(stream.id, expense.id, { amount }, selfEmployment, setSelfEmployment)}
                      />
                      <button className="delete-btn" onClick={() => setSelfEmployment(selfEmployment.map(s => s.id === stream.id ? {...s, expenses: s.expenses.filter((e: any) => e.id !== expense.id)} : s))}>×</button>
                    </div>
                  ))}
                </div>
                <button
                  className="secondary"
                  onClick={() =>
                    setSelfEmployment(
                      selfEmployment.map((item) =>
                        item.id === stream.id
                          ? { ...item, expenses: [...item.expenses, { id: uid(), label: "Expense", amount: 0, bucket: 'living' }] }
                          : item,
                      ),
                    )
                  }
                >
                  Add expense
                </button>
                <div className="mini-total">Profit {money.format(Math.max(0, stream.gross - expenses))}</div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function TaxSection({ tax, sippNetContribution }: any) {
  const taxable = Number(tax.payeTaxable || 0);
  const selfEmployedProfit = Number(tax.selfProfit || 0);
  const allowance = Number(tax.combinedTax?.allowance || 0);
  
  const taxableTotal = taxable + selfEmployedProfit;
  const adjustedNet = tax.combinedTax?.adjustedNetIncome || 0;
  const sippNeeded = Math.max(0, adjustedNet - 100000);
  
  return (
    <div className="workspace">
      <section className="panel span-12">
        <h2>Tax Estimate</h2>
        <ResultRows
          rows={[
            ["PAYE taxable", money.format(taxable)],
            ["Self-employed profit", money.format(selfEmployedProfit)],
            ["Adjusted net income", money.format(adjustedNet)],
            ["Personal allowance", money.format(allowance)],
            ["Income tax", money.format(Number(tax.combinedTax?.totalTax || 0))],
            ["National Insurance", money.format(Number(tax.totalNi || 0))],
            ["PAYE tax credited", money.format(Number(tax.assumedPayeTaxPaid || 0))],
            ["SIPP contribution (Net)", money.format(Number(sippNetContribution || 0))],
            ["SIPP contribution (Gross)", money.format(Number(sippNetContribution || 0) * 1.25)],
          ]}
        />
        <div style={{ marginTop: '20px' }}>
          {[
            { label: "Basic", pct: "20%", val: adjustedNet > 0 ? Math.min(100, (adjustedNet / 50270) * 100) : 0 },
            { label: "Higher", pct: "40%", val: adjustedNet > 50270 ? Math.min(100, (adjustedNet - 50270) / (125140 - 50270) * 100) : 0 },
            { label: "Additional", pct: "45%", val: adjustedNet > 125140 ? Math.min(100, (adjustedNet - 125140) / 100000 * 100) : 0 }
          ].map(band => (
            <div key={band.label} style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
              <span style={{ width: '80px', fontWeight: 600 }}>{band.label}</span>
              <div style={{ flex: 1, height: '12px', background: '#eee', borderRadius: '6px', overflow: 'hidden' }}>
                <div style={{ width: `${band.val}%`, height: '100%', background: '#2c7363' }} />
              </div>
              <span style={{ width: '40px', textAlign: 'right', fontWeight: 700 }}>{band.pct}</span>
            </div>
          ))}
        </div>
        <div className="callout" style={{ marginTop: '20px', background: sippNeeded > 0 ? '#f6e05e' : '#e2e8f0', padding: '16px', borderRadius: '8px' }}>
          <strong>SIPP Contribution</strong>: 
          {sippNeeded > 0 
            ? ` To bring your adjusted net income below £100,000, you need to contribute ${money.format(sippNeeded/12)} net a month (${money.format(sippNeeded * 1.25)} gross annually with govt contribution) to your SIPP.`
            : " Your adjusted net income is currently below £100,000."
          }
        </div>
      </section>
    </div>
  );
}

function SettingsSection({ taxSettings, setTaxSettings, birthYear, setBirthYear, birthMonth, setBirthMonth, tax }: any) {
  return (
    <div className="workspace">
      <section className="panel span-6">
        <h2>Tax Settings</h2>
        <div className="settings-grid">
          <label>
            Tax code
            <input placeholder="1257L" value={taxSettings.taxCode} onChange={(event) => setTaxSettings({ ...taxSettings, taxCode: event.target.value })} />
          </label>
          <label>
            Region
            <select value={taxSettings.region} onChange={(event) => setTaxSettings({ ...taxSettings, region: event.target.value as TaxSettings["region"] })}>
              <option value="england-wales-ni">England, Wales, NI</option>
              <option value="scotland">Scotland</option>
            </select>
          </label>
        </div>
        <div className="callout neutral">
          <ResultRows
            rows={[
              ["Personal allowance", tax.combinedTax.allowance],
              ["Income tax", tax.combinedTax.totalTax],
              ["National Insurance", tax.totalNi],
            ]}
          />
        </div>
      </section>

      <section className="panel span-6">
        <h2>Profile Details</h2>
        <div className="settings-grid">
          <label>Birth Year <input type="number" placeholder="YYYY" value={birthYear || ""} onChange={e => setBirthYear(Number(e.target.value))} /></label>
          <label>Birth Month (1-12) <input type="number" min="1" max="12" placeholder="MM" value={birthMonth || ""} onChange={e => setBirthMonth(Number(e.target.value))} /></label>
        </div>
        <p className="notice" style={{ maxWidth: 'none' }}>
          These details are used to calculate your current age and pension access dates.
        </p>
      </section>
    </div>
  );
}

function BudgetSection({
  monthlyNet,
  budget,
  budgetLines,
  setBudgetLines,
  annualBills,
  setAnnualBills,
  savings,
  mortgageOverpayment,
  setActiveSection,
}: {
  monthlyNet: number;
  budget: ReturnType<typeof budgetSummary>;
  budgetLines: BudgetLine[];
  setBudgetLines: React.Dispatch<React.SetStateAction<BudgetLine[]>>;
  annualBills: ExpenseLine[];
  setAnnualBills: React.Dispatch<React.SetStateAction<ExpenseLine[]>>;
  savings: SavingsBucket[];
  mortgageOverpayment: number;
  setActiveSection: (section: SectionId) => void;
}) {
  return (
    <div className="workspace">
      <section className="panel span-6">
        <PanelHeader title="Monthly Expenses" actionLabel="Add expense" onAction={() => setBudgetLines([...budgetLines, { id: uid(), label: "New expense", amount: 0, bucket: "living" }])} />
        <div className="budget-lines">
          <div className="budget-row header desktop-only">
            <span>Label</span>
            <span>Category</span>
            <span>Amount</span>
            <span></span>
          </div>
          {budgetLines.map((line) => (
            <div className="budget-row" key={line.id}>
              <div><div className="mobile-label">Label</div><TextInput placeholder="e.g. Rent" value={line.label} onChange={(label) => setBudgetLines(updateItem(budgetLines, line.id, { label }))} /></div>
              <div><div className="mobile-label">Category</div><select value={line.bucket} onChange={(event) => setBudgetLines(updateItem(budgetLines, line.id, { bucket: event.target.value as BudgetLine["bucket"] }))}>
                <option value="living">Living</option>
                <option value="housing">Housing</option>
                <option value="debt">Debt</option>
                <option value="tax">Tax</option>
                <option value="food">Food</option>
                <option value="entertainment">Entertainment</option>
                <option value="professional">Professional</option>
              </select></div>

              <div><div className="mobile-label">Amount</div><NumberInput placeholder="0" value={line.amount} onChange={(amount) => setBudgetLines(updateItem(budgetLines, line.id, { amount }))} /></div>
              <button className="delete-btn" onClick={() => setBudgetLines(budgetLines.filter((l: any) => l.id !== line.id))}>×</button>
            </div>
          ))}
        </div>
      </section>

      <section className="panel span-6">
        <PanelHeader title="Annual Bills" actionLabel="Add annual bill" onAction={() => setAnnualBills([...annualBills, { id: uid(), label: "Annual bill", amount: 0, bucket: 'living' }])} />
        <div className="budget-lines">
          <div className="budget-row header desktop-only">
            <span>Label</span>
            <span>Category</span>
            <span>Amount</span>
            <span></span>
          </div>
          {annualBills.map((line) => (
            <div className="budget-row" key={line.id}>
              <div><div className="mobile-label">Label</div><TextInput placeholder="e.g. Car Insurance" value={line.label} onChange={(label) => setAnnualBills(updateItem(annualBills, line.id, { label }))} /></div>
              <div><div className="mobile-label">Category</div><select value={line.bucket} onChange={(event) => setAnnualBills(updateItem(annualBills, line.id, { bucket: event.target.value as any }))}>
                <option value="living">Living</option>
                <option value="housing">Housing</option>
                <option value="debt">Debt</option>
                <option value="tax">Tax</option>
                <option value="food">Food</option>
                <option value="entertainment">Entertainment</option>
                <option value="professional">Professional</option>
                <option value="saving">Saving</option>
              </select></div>
              <div><div className="mobile-label">Amount</div><NumberInput placeholder="0" value={line.amount} onChange={(amount) => setAnnualBills(updateItem(annualBills, line.id, { amount }))} /></div>
              <button className="delete-btn" onClick={() => setAnnualBills(annualBills.filter((l: any) => l.id !== line.id))}>×</button>
            </div>
          ))}
        </div>
        <div className="mini-total">Monthly provision {monthlyMoney.format(budget.annualBillsMonthly)}</div>
      </section>

      <section className="panel span-6">
        <h2>Savings Included In Budget</h2>
        <div className="result-rows">
          {savings.map((bucket) => (
            <div key={bucket.id}>
              <span>{bucket.label}</span>
              <strong>{monthlyMoney.format(bucket.monthly)}</strong>
            </div>
          ))}
          {mortgageOverpayment > 0 && (
            <div key="mortgage-overpayment">
              <span>Mortgage Overpayment</span>
              <strong>{monthlyMoney.format(mortgageOverpayment)}</strong>
            </div>
          )}
        </div>
        <button className="wide-action" onClick={() => setActiveSection("savings")}>Edit savings buckets</button>
      </section>

      <section className="panel span-6">
        <h2>Budget Summary</h2>
        <ResultRows
          rows={[
            ["Monthly net income", monthlyNet],
            ["Monthly expenses", budget.monthlyExpenses],
            ["Monthly savings", budget.monthlySavings],
            ["Monthly surplus", budget.monthlySurplus],
          ]}
        />
      </section>
    </div>
  );
}

function SavingsSection({
  savings, setSavings, projectionYears, setProjectionYears, projectedSavings, projectedTotal, allProjectedTotal,
  employmentPensionMonthly, employerPensionMonthly, nhsJobsGross, civilServiceJobsGross, teachersJobsGross,
  drawdownSettings,
}: any) {
  const refs = useMemo(() => savings.reduce((acc: any, b: any) => ({ ...acc, [b.id]: React.createRef<HTMLDivElement>() }), {}), [savings]);
  return (
    <div className="workspace">
      <section className="panel span-12">
        <div className="split-title">
          <h2>Savings Manager</h2>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ fontSize: "0.9rem", color: "#666" }}>Projection Period:</span>
            <div style={{ width: "100px" }}>
              <NumberInput placeholder="10" value={projectionYears} onChange={setProjectionYears} suffix="yrs" />
            </div>
          </div>
        </div>
        <details className="disclosure-section" style={{ marginBottom: "16px", border: "1px solid #e7e0d5", borderRadius: "8px" }} open><summary style={{ padding: "16px", background: "#fcfaf6", cursor: "pointer", fontWeight: 600 }}>Manage Individual Savings</summary><div style={{ padding: "16px" }}>{savings.map((bucket: SavingsBucket) => (
          <div key={bucket.id} ref={refs[bucket.id]}>
            <details className="disclosure-section" style={{ marginBottom: "16px", border: "1px solid #e7e0d5", borderRadius: "8px", overflow: "hidden" }}>
              <summary style={{ padding: "16px", background: "#fcfaf6", cursor: "pointer", fontWeight: 600, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                {bucket.label || "New Savings"} ({bucket.type === 'isa' ? 'ISA' : bucket.type === 'lisa' ? 'LISA' : bucket.type})
              </summary>
              <div style={{ padding: "16px" }}>
                <div className="settings-grid">
                  <div><label>Name</label><TextInput placeholder="e.g. ISA" value={bucket.label} onChange={(label: string) => setSavings(updateItem(savings, bucket.id, { label } as Partial<SavingsBucket>))} /></div>
                  <div><label>Type</label>
                    <select value={bucket.type} onChange={(event) => setSavings(updateItem(savings, bucket.id, { type: event.target.value } as Partial<SavingsBucket>))}>
                      <option value="cash">Cash</option>
                      <option value="isa">ISA</option>
                      <option value="lisa">Lifetime ISA</option>
                      <option value="pension">Pension / SIPP</option>
                      <option value="workplace-private-pension">Workplace private pension</option>
                      <option value="nhs-pension">NHS Pension</option>
                      <option value="civil-service-pension">Civil Service Pension</option>
                      <option value="teachers-pension">Teachers' Pension</option>
                    </select>
                  </div>
                  <div><label>Balance</label><NumberInput placeholder="0" value={bucket.balance} onChange={(balance: number) => setSavings(updateItem(savings, bucket.id, { balance } as Partial<SavingsBucket>))} /></div>
                  <div><label>Monthly</label><NumberInput placeholder="0" value={parseFloat(bucket.monthly.toFixed(2))} onChange={(monthly: number) => setSavings(updateItem(savings, bucket.id, { monthly } as Partial<SavingsBucket>))} /></div>
                  <div><label>Growth %</label><NumberInput placeholder="0" value={bucket.annualRate} onChange={(annualRate: number) => setSavings(updateItem(savings, bucket.id, { annualRate } as Partial<SavingsBucket>))} suffix="%" /></div>
                </div>
                <button className="delete-btn" onClick={() => setSavings(savings.filter((s: SavingsBucket) => s.id !== bucket.id))} style={{ marginTop: "16px", width: "100%" }}>Delete Bucket</button>
              </div>
            </details>
          </div>
        ))}
        <button style={{ width: "100%" }} onClick={() => setSavings([...savings, { id: uid(), label: "New savings", balance: 0, monthly: 0, annualRate: 3, type: "cash" }])}>Add Savings Bucket</button></div></details>
      </section>
      {savings.filter((b: { type: any; }) => ['nhs-pension', 'civil-service-pension', 'teachers-pension'].includes(b.type)).length > 0 && (
        <section className="panel span-12">
            <h2>Expected Retirement Pension Income</h2>
            {savings.filter((b: { type: any; }) => ['nhs-pension', 'civil-service-pension', 'teachers-pension'].includes(b.type)).map((bucket: { type: string; nhsScheme: string; dbScheme: string; nhsSalary: any; dbSalary: any; nhsYearsService: any; dbYearsService: any; id: React.Key | null | undefined; label: string | number | bigint | boolean | React.ReactElement<unknown, string | React.JSXElementConstructor<any>> | Iterable<React.ReactNode> | React.ReactPortal | Promise<string | number | bigint | boolean | React.ReactPortal | React.ReactElement<unknown, string | React.JSXElementConstructor<any>> | Iterable<React.ReactNode> | null | undefined> | null | undefined; }) => {
                const accrual = bucket.type === 'nhs-pension' ? (bucket.nhsScheme === "1995" ? 80 : bucket.nhsScheme === "2008" ? 60 : 54) :
                                bucket.type === 'civil-service-pension' ? (bucket.dbScheme === "classic" ? 80 : (bucket.dbScheme === "premium" || bucket.dbScheme === "nuvos") ? 60 : 43.1) :
                                (bucket.dbScheme === "classic" || bucket.dbScheme === "80th") ? 80 : bucket.dbScheme === "60th" ? 60 : 57;
                
                const salary = bucket.type === 'nhs-pension' ? (nhsJobsGross || bucket.nhsSalary || bucket.dbSalary || 0) :
                                bucket.type === 'civil-service-pension' ? (civilServiceJobsGross || bucket.dbSalary || 0) :
                                (teachersJobsGross || bucket.dbSalary || 0);
                
                const years = (bucket.nhsYearsService || bucket.dbYearsService || 0) + projectionYears;
                const annualIncome = (salary / accrual) * years;

                return (
                    <div key={bucket.id} className="callout" style={{ 
                        background: bucket.type === 'nhs-pension' ? '#f0f7ff' : bucket.type === 'civil-service-pension' ? '#f6f1ff' : '#fff5f5', 
                        border: `1px solid ${bucket.type === 'nhs-pension' ? '#3182ce' : bucket.type === 'civil-service-pension' ? '#805ad5' : '#e53e3e'}`,
                        marginBottom: '10px'
                    }}>
                        <strong>{bucket.label}</strong>: Estimated <strong>{money.format(annualIncome)}/year</strong> from age 67 onwards.
                    </div>
                );
            })}
        </section>
      )}
      <section className="panel span-12">
        <h2>Savings Projections</h2>
        <div style={{ marginBottom: "16px", fontSize: "0.85rem", color: "#666", fontStyle: "italic" }}>* Projections assume consistent monthly contributions. Click a bar to edit.</div>
        <div className="projection-bars">
          {projectedSavings.filter((bucket: { type: string; }) => !['nhs-pension', 'civil-service-pension', 'teachers-pension'].includes(bucket.type)).map((bucket: any) => {
            const isWithdrawn = bucket.withdrawnValue > 0;
            const displayValue = isWithdrawn ? bucket.withdrawnValue : bucket.projected;
            return (
              <div className={`projection-row ${bucket.isHidden ? "deselected" : ""}`} key={bucket.id}                 onClick={() => {
                  const ref = refs[bucket.id];
                  if (ref?.current) {
                    const masterDetails = ref.current.closest('details');
                    if (masterDetails) masterDetails.open = true;
                    
                    const bucketDetails = ref.current.querySelector('details');
                    if (bucketDetails) bucketDetails.open = true;
                    
                    ref.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }
                }} style={{ cursor: "pointer" }}>
                <div style={{ minWidth: "150px", display: "flex", flexDirection: "column" }}>
                  <strong>{bucket.label}</strong>
                  {bucket.projected <= 0 && bucket.isWithdrawn && (
                    <small style={{ color: "#a7332f", fontSize: "0.65rem", fontWeight: 800 }}>WITHDRAWN (EMPTY)</small>
                  )}
                  {bucket.projected > 0 && bucket.isWithdrawn && (
                    <small style={{ color: "#a26013", fontSize: "0.65rem", fontWeight: 800 }}>WITHDRAWING ({drawdownSettings[bucket.id]?.rate || 4}% rate)</small>
                  )}
                </div>
                <div className="bar-track" style={{ flex: 1, margin: "0 20px", borderStyle: bucket.isWithdrawn ? "dashed" : "solid", opacity: bucket.isWithdrawn ? 0.7 : 1 }}>
                  <div style={{ width: `${Math.max(2, (displayValue / Math.max(1, allProjectedTotal)) * 100)}%`, background: bucket.isWithdrawn && bucket.projected <= 0 ? "#cbd5e0" : undefined }} />
                </div>
                <b style={{ minWidth: "100px", textAlign: "right", opacity: bucket.projected <= 0 ? 0.5 : 1 }}>{money.format(displayValue)}</b>              </div>
            );
          })}
        </div>
        <div style={{ borderTop: "1px solid #eee", marginTop: "20px", paddingTop: "15px" }}>
          <Metric label={`Projected total in ${projectionYears.toFixed(2)} years`} value={money.format(projectedTotal)} tone="green" />
        </div>
      </section>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
function MortgageSection({
  mortgage,
  setMortgage,
  mortgageSummary,
}: {
  mortgage: MortgageInputs;
  setMortgage: React.Dispatch<React.SetStateAction<MortgageInputs>>;
  mortgageSummary: ReturnType<typeof calculateMortgage>;
}) {
  return (
    <section className="panel span-12 mortgage-panel">
      <h2>Mortgage Estimator</h2>
      <div className="mortgage-grid">
        <label>Mortgage amount <NumberInput placeholder="0" value={mortgage.amount} onChange={(amount) => setMortgage({ ...mortgage, amount })} /></label>
        <label>Annual rate % <NumberInput placeholder="0" value={mortgage.annualRate} onChange={(annualRate) => setMortgage({ ...mortgage, annualRate })} /></label>
        <label>Term years <NumberInput placeholder="0" value={mortgage.years} onChange={(years) => setMortgage({ ...mortgage, years })} /></label>
        <label>Monthly overpayment <NumberInput placeholder="0" value={mortgage.monthlyOverpayment} onChange={(monthlyOverpayment) => setMortgage({ ...mortgage, monthlyOverpayment })} /></label>
        <label>One-off month <NumberInput placeholder="0" value={mortgage.oneOffMonth} onChange={(oneOffMonth) => setMortgage({ ...mortgage, oneOffMonth })} /></label>
        <label>One-off amount <NumberInput placeholder="0" value={mortgage.oneOffAmount} onChange={(oneOffAmount) => setMortgage({ ...mortgage, oneOffAmount })} /></label>
      </div>
      <section className="summary-grid tight">
        <Metric label="Standard payment" value={monthlyMoney.format(mortgageSummary.standardPayment)} />
        <Metric label="Payoff time" value={`${mortgageSummary.payoffYears.toFixed(1)} years`} />
        <Metric label="Interest paid" value={money.format(mortgageSummary.totalInterest)} tone="amber" />
        <Metric label="Interest saved" value={money.format(mortgageSummary.interestSaved)} tone="green" />
      </section>
    </section>
  );
}

function DepletionChart({ projectedSavings, drawdownSettings, retirementAge, pensionAccessAge, inflationRate }: any) { 
  const years = [0, 5, 10, 15, 20, 25, 30]; 
  const colors = ['#2c7363', '#a26013', '#a7332f', '#4a5568', '#3182ce', '#805ad5', '#d53f8c', '#e6a23c', '#67c23a']; 
  
  const isAccessible = (bucket: any, age: number, settings: any) => { 
    // Manual withdrawal age override
    if (settings.useWithdrawAge && age >= settings.withdrawAge) return true; 
    
    // Standard access rules
    if (bucket.type === 'lisa') return age >= 60; 
    if (bucket.type === 'pension' || bucket.type === 'workplace-private-pension') return age >= pensionAccessAge; 
    if (['nhs-pension', 'civil-service-pension', 'teachers-pension'].includes(bucket.type)) return age >= (bucket.startWithdrawalAge || 67); 
    
    // Cash/ISA always accessible
    return true; 
  }; 

  const data = years.map(year => { 
    const age = Math.round(retirementAge + year); 
    const buckets = projectedSavings.filter((b: any) => !['nhs-pension', 'civil-service-pension', 'teachers-pension'].includes(b.type) && !b.isHidden).map((bucket: any) => { 
      const settings = drawdownSettings[bucket.id] || { rate: 4, useWithdrawAge: false, withdrawAge: 60, useStopAge: false, stopAge: 60 }; 
      
      // During retirement phase (from Year 0 onwards), we assume contributions have already stopped.
      // Therefore, growth is always at the economy-wide Inflation Rate (safe haven assets).
      const r = (inflationRate || 3) / 100; 
      const startingBalance = bucket.finalBalance || 0;

      let balance;

      if (!isAccessible(bucket, age, settings)) {
        // Pot is still growing until withdrawal age
        // If retirement age is 60 but withdrawal is at 65, it grows for those 5 years
        const growthYears = Math.max(0, age - retirementAge);
        balance = startingBalance * Math.pow(1 + r, growthYears);
      } else {
        // Pot is in drawdown
        // 1. Calculate how many years it's been in drawdown
        const drawdownStartAge = settings.useWithdrawAge ? settings.withdrawAge : (bucket.startWithdrawalAge || retirementAge);
        const yearsInDrawdown = Math.max(0, age - drawdownStartAge);

        // 2. Growth until drawdown starts
        const yearsUntilDrawdown = Math.max(0, drawdownStartAge - retirementAge);
        const balanceAtDrawdownStart = startingBalance * Math.pow(1 + r, yearsUntilDrawdown);

        const d = balanceAtDrawdownStart * (settings.rate / 100); 
        if (r === 0) { 
          balance = balanceAtDrawdownStart - d * yearsInDrawdown; 
        } else { 
          // Standard drawdown formula: P(1+r)^t - (d/r)((1+r)^t - 1)
          balance = balanceAtDrawdownStart * Math.pow(1 + r, yearsInDrawdown) - (d / r) * (Math.pow(1 + r, yearsInDrawdown) - 1); 
        } 
      } 
      return { label: bucket.label, value: Math.max(0, balance) }; 
      }); 
      return { year, age, buckets }; 
      }); 
  if (data[0].buckets.length === 0) return null; 
  return (
    <div className='depletion-chart' style={{ marginTop: '24px' }}>
      <h3>Pot Depletion Projection</h3>
      {/* <div style={{ marginBottom: '16px', fontSize: '0.8rem', color: '#666', fontStyle: 'italic' }}>
        * Starting values reflect your accumulated savings plus growth from age {Math.round(retirementAge - (projectedSavings[0]?.contributed > 0 ? (projectedSavings[0]?.projected / (projectedSavings[0]?.monthly * 12 || 1)) : 0))} until retirement.
      </div> */}
            <div style={{ marginBottom: '16px', fontSize: '0.8rem', color: '#666', fontStyle: 'italic' }}>
        * Starting values reflect your accumulated savings plus growth
      </div>
      <LineChart data={data} years={years} colors={colors} />
    </div>)
function LineChart({ data, years, colors }: any) { 
  const width = 800; 
  const height = 400; 
  const padding = 80; // Increased padding to prevent Y-axis label clipping
  const allValues = data.flatMap((d: any) => d.buckets.map((b: any) => b.value));
  const maxVal = Math.max(1000, ...allValues);
  const getX = (year: number) => padding + (year / years[years.length - 1]) * (width - 2 * padding);
  const getY = (val: number) => height - padding - (val / maxVal) * (height - 2 * padding);
  const bucketNames = data[0].buckets.map((b: any) => b.label);

  return (
    <div className='line-chart-container'>
      <svg viewBox={'0 0 ' + width + ' ' + height} style={{ width: '100%', height: 'auto', background: '#fffaf1', borderRadius: '8px', border: '1px solid #e7e0d5' }}>
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke='#ccc' strokeWidth='1' />
        <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke='#ccc' strokeWidth='1' />
        {[0, 0.25, 0.5, 0.75, 1].map(p => (
          <g key={p}>
            <line x1={padding} y1={getY(maxVal * p)} x2={width - padding} y2={getY(maxVal * p)} stroke='#f0ece4' strokeDasharray='4' />
            <text x={padding - 10} y={getY(maxVal * p) + 4} textAnchor='end' fontSize='11' fill='#888'>{money.format(maxVal * p)}</text>
          </g>
        ))}
        {data.map((d: any) => (
          <g key={d.year}>
            <text x={getX(d.year)} y={height - padding + 20} textAnchor='middle' fontSize='11' fill='#888'>{'+' + d.year + 'y'}</text>
            <text x={getX(d.year)} y={height - padding + 35} textAnchor='middle' fontSize='10' fill='#aaa'>{'Age ' + d.age}</text>
          </g>
        ))}
        {bucketNames.map((name: string, i: number) => {
          const points = data.map((d: any) => {
            const bucket = d.buckets.find((b: any) => b.label === name);
            return getX(d.year) + ',' + getY(bucket.value);
          }).join(' ');
          return (
            <polyline key={name} fill='none' stroke={colors[i % colors.length]} strokeWidth='3' strokeLinejoin='round' strokeLinecap='round' points={points} />
          );
        })}
      </svg>
      <div className='chart-legend' style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '14px', justifyContent: 'center' }}>
        {bucketNames.map((name: string, i: number) => (
          <div key={name} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '12px', height: '12px', borderRadius: '2px', background: colors[i % colors.length] }} />
            <small style={{ fontWeight: 600, color: '#555' }}>{name}</small>
          </div>
        ))}
      </div>
    </div>
  );
}
}

