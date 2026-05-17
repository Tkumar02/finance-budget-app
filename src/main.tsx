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

const uid = () => crypto.randomUUID();

const initialPaye: PayeIncome[] = [
  { id: uid(), label: "", gross: 0, pensionRate: 0, employerPensionContribution: 0, taxPaid: 0 },
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
    sippNetContribution: 8506,
  });
  const [budgetLines, setBudgetLines] = useState(initialBudget);
  const [annualBills, setAnnualBills] = useState(initialAnnualBills);
  const [savings, setSavings] = useState(initialSavings);
  const [projectionYears, setProjectionYears] = useState(10);
  const [mortgage, setMortgage] = useState<MortgageInputs>({
    amount: 282999,
    annualRate: 3.78,
    years: 26,
    monthlyOverpayment: 1500,
    oneOffMonth: 0,
    oneOffAmount: 0,
  });

  const [birthYear, setBirthYear] = useState(1990);
  const [birthMonth, setBirthMonth] = useState(1);
  const [expectedOutgoings, setExpectedOutgoings] = useState(0);
  const [drawdownRate, setDrawdownRate] = useState(4); // Defaulting to 4%
  const [otherRetirementIncome, setOtherRetirementIncome] = useState<(ExpenseLine & { isTaxable?: boolean })[]>([]);
  const [drawdownSettings, setDrawdownSettings] = useState<Record<string, { enabled: boolean; rate: number; lumpSumTaken?: boolean }>>({});
  const [inflationRate, setInflationRate] = useState(3);
  const [additionalRetirementExpenses, setAdditionalRetirementExpenses] = useState<ExpenseLine[]>([]);
  const [retirementTaxableFraction, setRetirementTaxableFraction] = useState(0.75);

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
  }), [
    paye, selfEmployment, taxSettings, budgetLines, annualBills, savings,
    projectionYears, mortgage, birthYear, birthMonth, expectedOutgoings,
    drawdownRate, otherRetirementIncome, drawdownSettings, inflationRate,
    additionalRetirementExpenses, retirementTaxableFraction
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
    // 1. Separate standard and public sector contributions
    const standardEmployerMonthly = paye.filter(j => (j.pensionType || 'standard') === 'standard').reduce((sum, job) => {
      const monthly = (job.gross * (job.employerPensionContribution || 0)) / 1200;
      return sum + monthly;
    }, 0);

    const standardEmployeeMonthly = paye.filter(j => (j.pensionType || 'standard') === 'standard').reduce((sum, job) => {
      return sum + (job.gross * (job.pensionRate || 0)) / 1200;
    }, 0);

    return savings.map((bucket) => {
      if (bucket.type === "workplace-private-pension") {
        return { 
          ...bucket, 
          monthly: bucket.monthly + standardEmployeeMonthly + standardEmployerMonthly
        };
      }
      // DB Pensions are Defined Benefit; contributions don't build a 'pot balance'
      return bucket;
    });
  }, [savings, paye]);
  const budget = useMemo(
    () => budgetSummary(tax.monthlyNet, budgetLines, annualBills, savingsForBudget, mortgage.monthlyOverpayment),
    [tax.monthlyNet, budgetLines, annualBills, savingsForBudget, mortgage.monthlyOverpayment],
  );

  // Adjusted budget for overview to include the tax set-aside
  const monthlyTaxSetAside = tax.selfAssessmentDue / 12;
  const overviewBudget = useMemo(() => {
    const monthlyOutWithTax = budget.monthlyOut + monthlyTaxSetAside;
    return {
      ...budget,
      monthlyOut: monthlyOutWithTax,
      monthlySurplus: tax.monthlyNet - monthlyOutWithTax,
    };
  }, [budget, monthlyTaxSetAside, tax.monthlyNet]);

  const projectedSavings = useMemo(
  () => projectSavings(projectionBuckets, projectionYears,birthYear),
  [projectionBuckets, projectionYears],
);
  const mortgageSummary = useMemo(() => calculateMortgage(mortgage), [mortgage]);
  const targetGross = useMemo(
    () => requiredGrossForNet(Math.max(0, budget.monthlyOut * 12), taxSettings.taxCode, taxSettings.region),
    [budget.monthlyOut, taxSettings],
  );
  const projectedTotal = projectedSavings.reduce((sum, bucket) => {
    return bucket.isHidden ? sum : sum + bucket.projected;
  }, 0);
  const allProjectedTotal = projectedSavings.reduce((sum, bucket) => sum + bucket.projected, 0);

  const currentAge = (new Date().getFullYear() - birthYear) + (new Date().getMonth() + 1 - birthMonth) / 12;
  const retirementAge = currentAge + projectionYears;

  const isBucketAccessible = (type: string, age: number) => {
    if (type === 'lisa') return age >= 60;
    if (type === 'pension' || type === 'workplace-private-pension') return age >= pensionAccessAge;
    if (['nhs-pension', 'civil-service-pension', 'teachers-pension'].includes(type)) return age >= 67; // State Pension Age for most
    return true;
  };

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
      const settings = drawdownSettings[bucket.id] || { enabled: true, rate: 4, lumpSumTaken: false };
      if (!settings.enabled) return;

      let annualIncome = 0;
      let taxableIncome = 0;

      if (['nhs-pension', 'civil-service-pension', 'teachers-pension'].includes(bucket.type)) {
        if (!isBucketAccessible(bucket.type, retirementAge)) return;
        
        let salary = bucket.dbSalary || 0;
        let yearsAtRetirement = (bucket.dbYearsService || 0) + projectionYears;
        let accrual = 54; // Default

        if (bucket.type === 'nhs-pension') {
            salary = nhsJobsGross || bucket.nhsSalary || bucket.dbSalary || 0;
            yearsAtRetirement = (bucket.nhsYearsService || bucket.dbYearsService || 0) + projectionYears;
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
          val = val * 0.75;
        }

        // 2. Only block the pot if it's NOT a LISA and it's currently inaccessible
        if (bucket.type !== 'lisa' && !isBucketAccessible(bucket.type, retirementAge)) {
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
  }, [projectedSavings, retirementAge, otherRetirementIncome, expectedOutgoings, drawdownSettings, pensionAccessAge, nhsJobsGross, civilServiceJobsGross, teachersJobsGross, projectionYears, taxSettings, isBucketAccessible, budget.monthlyExpenses, inflationRate, budgetLines, annualBills, additionalRetirementExpenses]);


  
  const sections = [
    { id: "overview", title: "Overview", value: monthlyMoney.format(overviewBudget.monthlySurplus), detail: "monthly surplus" },
    { id: "income", title: "Income", value: money.format(tax.payeGross + tax.selfProfit), detail: "gross + profit" },
    { id: "budget", title: "Budget", value: monthlyMoney.format(overviewBudget.monthlyOut), detail: "monthly outflow" },
    { id: "savings", title: "Savings", value: money.format(projectedTotal), detail: `${projectionYears.toFixed(2)} year projection` },
    { id: "mortgage", title: "Mortgage", value: `${mortgageSummary.payoffYears.toFixed(1)} yrs`, detail: "payoff estimate" },
    { id: "retirement", title: "Retirement", value: monthlyMoney.format(retirementSummary.monthlyIn), detail: "post-work income" },
  ] satisfies { id: SectionId; title: string; value: string; detail: string }[];

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
              <small>{section.detail}</small>
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

      {activeSection === "overview" ? (
        <OverviewSection
          budget={overviewBudget}
          tax={tax}
          targetGross={targetGross}
          sippNetContribution={totalSippNet}
          taxSetAside={monthlyTaxSetAside}
          setActiveSection={setActiveSection}
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
          otherIncome={otherRetirementIncome} setOtherIncome={setOtherRetirementIncome}
          summary={retirementSummary}
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
  otherIncome: (ExpenseLine & { isTaxable?: boolean })[];
  setOtherIncome: React.Dispatch<React.SetStateAction<(ExpenseLine & { isTaxable?: boolean })[]>>;
  summary: any;
  projectedSavings: any[];
  drawdownSettings: any;
  setDrawdownSettings: (s: any) => void;
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
}) {
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
    let hasLisaPenalty = false;
    const totals = projectedSavings.reduce((acc, bucket) => {
      let val = bucket.projected;
      if (bucket.type === 'lisa' && retirementAge < 60) {
        val = val * 0.75;
        hasLisaPenalty = true;
      }

      if (['pension', 'workplace-private-pension', 'nhs-pension', 'civil-service-pension', 'teachers-pension'].includes(bucket.type)) {
        acc.pension += val;
      } else if (['isa', 'lisa', 'cash'].includes(bucket.type)) {
        acc.isaCash += val;
      }
      return acc;
    }, { pension: 0, isaCash: 0 });
    
    return { ...totals, hasLisaPenalty };
  }, [projectedSavings, retirementAge]);

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
      </section>

      <section className="panel span-12">
        <details className="disclosure-section" open>
          <summary><h2>Retirement Funding Analysis</h2></summary>
          <div className="disclosure-content">
            <div className="notice" style={{ marginBottom: '16px' }}>
              Select which current expenses and annual bills will continue into retirement.
            </div>
            
            <div className="budget-lines" style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid #eee', padding: '12px', borderRadius: '8px', marginBottom: '16px' }}>
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
                  
                  <div style={{ marginTop: '12px', fontSize: '0.8rem', color: '#666' }}>
                    To fund the <strong>{money.format(targetGrossSummary.netGap)}</strong> gap at a <strong>{drawdownRate}%</strong> drawdown rate:
                  </div>

                  <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px dashed #ccc' }}>
                    <button 
                      className="wide-action" 
                      onClick={async () => {
                        const snapshot = getFinancialSnapshot(birthYear, birthMonth, retirementAge, budgetExpenses, mortgageSummary, mortgage, projectedSavings, otherIncome);
                        alert("Analyzing... Please wait.");
                        try {
                          const model = getGenerativeModel(ai, { model: 'gemini-2.5-flash' });
                          const prompt = `
                            You are a UK retirement strategy expert. Analyze the following financial snapshot and provide a concise, actionable 3-step drawdown strategy.
                            Prioritize tax efficiency, state pension bridging, and mortgage payoff.

                            Snapshot: ${JSON.stringify(snapshot)}

                            Output format:
                            1. **Key Observation**: 1 sentence on the biggest strength/risk.
                            2. **Strategy**: 3 clear bullet points.
                            3. **Warning**: Any potential tax traps or risks.
                          `;

                          const result = await model.generateContent(prompt);
                          const response = result.response;
                          alert("Analysis:\n" + response.text());                        } catch (e: any) {
                          console.error(e);
                          alert("Analysis failed: " + e.message);
                        }
                      }}
                    >
                      Analyze Retirement Strategy
                    </button>                    <div className="retirement-comparison-grid">                      <div className={`metric pension-card ${pensionSurplus >= 0 ? 'green' : 'red'}`} style={{ minHeight: 'auto', padding: '12px' }}>
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
                          {actualProjectedTotals.hasLisaPenalty && (
                            <small style={{ color: '#a7332f', fontWeight: 800, fontSize: '0.6rem' }}>LISA 25% PENALTY APPLIED</small>
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
                <span>Include</span>
                <span>Pot</span>
                <span title="Tick if 25% tax-free lump sum already taken">Lump Sum?</span>
                <span>Drawdown %</span>
              </div>
              {projectedSavings.map((bucket: any) => {
                const accessible = isBucketAccessible(bucket.type, retirementAge);
                const isPension = bucket.type === 'pension' || bucket.type === 'workplace-pension';
                
                return (
                  <div className={`table-row ${!accessible ? "deselected" : ""}`} key={bucket.id}>
                    <div>
                      <div className="mobile-label">Include</div>
                      <input
                        type="checkbox"
                        checked={drawdownSettings[bucket.id]?.enabled ?? true}
                        onChange={() => {
                          const current = drawdownSettings[bucket.id] || { enabled: true, rate: 4 };
                          setDrawdownSettings({ ...drawdownSettings, [bucket.id]: { ...current, enabled: !current.enabled } });
                        }}
                      />
                    </div>
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
                          checked={drawdownSettings[bucket.id]?.lumpSumTaken ?? false}
                          onChange={() => {
                            const current = drawdownSettings[bucket.id] || { enabled: true, rate: 4 };
                            setDrawdownSettings({ ...drawdownSettings, [bucket.id]: { ...current, lumpSumTaken: !current.lumpSumTaken } });
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
                          value={drawdownSettings[bucket.id]?.rate ?? 4} 
                          onChange={(rate) => {
                            const current = drawdownSettings[bucket.id] || { enabled: true, rate: 4 };
                            setDrawdownSettings({ ...drawdownSettings, [bucket.id]: { ...current, rate } });
                          }}
                          suffix="%" 
                        />
                      )}
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
                style={{ fontSize: '0.7rem', height: '24px', minHeight: 'auto', padding: '0 8px' }}
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
                  <div><div className="mobile-label">Amount</div><NumberInput placeholder="0" value={item.amount} onChange={(a) => setOtherIncome(updateItem<any>(otherIncome, item.id, { amount: a }))} /></div>
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
        {hasActiveLisa && retirementAge < 60 && (
          <p style={{color: '#a7332f', fontSize: '0.8rem', marginTop: '10px'}}>
            * LISA 25% penalty applied for retirement before age 60.
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
}: {
  budget: any;
  tax: ReturnType<typeof calculateTaxSummary>;
  targetGross: number;
  sippNetContribution: number;
  taxSetAside: number;
  setActiveSection: (section: SectionId) => void;
}) {
  return (
    <div className="workspace overview-workspace">
      <section className="panel span-8">
        <h2>Current Plan</h2>
        <ResultRows
          rows={[
            ["Monthly net income", tax.monthlyNet],
            ["Monthly expenses", budget.monthlyExpenses],
            ["Monthly savings", budget.monthlySavings],
            ["Tax set-aside", taxSetAside],
            ["Monthly surplus", budget.monthlySurplus],
            ["Gross income needed for current plan", targetGross],
          ]}
        />
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

  return (
    <div className="workspace">
      <section className="panel span-12">
        <PanelHeader
          title="PAYE Income"
          actionLabel="Add PAYE"
          onAction={() =>
            setPaye([...paye, { id: uid(), label: "New PAYE job", gross: 0, pensionRate: 0, employerPensionContribution: 0, taxPaid: 0, pensionType: "standard" }])
          }
        />
        <div className="table income-table">
          <div className="table-row header">
            <span>PAYE income</span>
            <span>Gross</span>
            <span>Pension Type</span>
            <span>Employee pension %</span>
            <span>Employer pension</span>
            <span>Tax paid</span>
            <span></span>
          </div>
          {paye.map((income) => (
            <div className="table-row" key={income.id}>
              <div><div className="mobile-label">Source</div><TextInput placeholder="e.g. Main Job" value={income.label} onChange={(label) => setPaye(updateItem(paye, income.id, { label }))} /></div>
              <div><div className="mobile-label">Gross</div><NumberInput placeholder="0" value={income.gross} onChange={(gross) => {
                const patch: any = { gross };
                if (income.pensionType === 'nhs') {
                   patch.pensionRate = calculateNhsEmployeeRate(gross);
                   patch.employerPensionContribution = (gross * NHS_EMPLOYER_RATE) / 100;
                }
                setPaye(updateItem(paye, income.id, patch));
              }} /></div>
              <div>
                <div className="mobile-label">Pension Type</div>
                <select value={income.pensionType || "standard"} onChange={(e) => {
                  const val = e.target.value as any;
                  const patch: any = { pensionType: val };
                  if (val === 'nhs') {
                    patch.pensionRate = calculateNhsEmployeeRate(income.gross);
                    patch.employerPensionContribution = (income.gross * NHS_EMPLOYER_RATE) / 100;
                    ensureNhsBucket();
                  }
                  if (val === 'civil-service') {
                    ensureCivilServiceBucket();
                  }
                  if (val === 'teachers') {
                    ensureTeachersBucket();
                  }
                  setPaye(updateItem(paye, income.id, patch));
                }}>
                  <option value="standard">Standard</option>
                  <option value="nhs">NHS</option>
                  <option value="civil-service">Civil Service</option>
                  <option value="teachers">Teachers</option>
                </select>

              </div>
              <div><div className="mobile-label">Employee Pension %</div><NumberInput placeholder="0" value={income.pensionRate} onChange={(pensionRate) => setPaye(updateItem(paye, income.id, { pensionRate }))} suffix="%" /></div>
              <div><div className="mobile-label">Employer Pension</div><NumberInput placeholder="0" value={income.employerPensionContribution} onChange={(employerPensionContribution) => setPaye(updateItem(paye, income.id, { employerPensionContribution }))} /></div>
              <div><div className="mobile-label">Tax Paid</div><NumberInput placeholder="0" value={income.taxPaid} onChange={(taxPaid) => setPaye(updateItem(paye, income.id, { taxPaid }))} /></div>
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
  savings,
  setSavings,
  projectionYears,
  setProjectionYears,
  projectedSavings,
  projectedTotal,
  allProjectedTotal,
  employmentPensionMonthly,
  employerPensionMonthly,
  nhsJobsGross,
  civilServiceJobsGross,
  teachersJobsGross,
}: {
  savings: SavingsBucket[];
  setSavings: React.Dispatch<React.SetStateAction<SavingsBucket[]>>;
  projectionYears: number;
  setProjectionYears: React.Dispatch<React.SetStateAction<number>>;
  projectedSavings: (SavingsBucket & { projected: number; contributed: number })[];
  projectedTotal: number;
  allProjectedTotal: number;
  employmentPensionMonthly: number;
  employerPensionMonthly: number;
  nhsJobsGross: number;
  civilServiceJobsGross: number;
  teachersJobsGross: number;
}) {
  return (
    <div className="workspace">
      <section className="panel span-12">
        <div className="split-title">
          <h2>Savings Projection</h2>
          {/* Constrained the Years input so it stays on the right */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '0.9rem', color: '#666' }}>Projection Period:</span>
            <div style={{ width: '100px' }}>
              <NumberInput placeholder="10" value={projectionYears} onChange={setProjectionYears} suffix="yrs" />
            </div>
          </div>
        </div>

        <div className="table savings-table">
          <div 
            className="table-row header" 
            style={{ 
              display: 'grid', 
              gridTemplateColumns: '40px 1.5fr 1fr 1fr 1fr 1fr 40px', 
              gap: '10px', 
              alignItems: 'center' 
            }}
          >
            <span>Show</span>
            <span>Bucket</span>
            <span>Type</span>
            <span>Current capital</span>
            <span>Monthly saving</span>
            <span>Growth %</span>
            <span></span>
          </div>
          
          {projectedSavings.map((bucket) => {
            const isDbPension = ['nhs-pension', 'civil-service-pension', 'teachers-pension'].includes(bucket.type);
            let dbIncome = 0;
            if (isDbPension) {
                let salary = bucket.dbSalary || 0;
                let yearsAtRetirement = (bucket.dbYearsService || 0) + projectionYears;
                let accrual = 54;

                if (bucket.type === 'nhs-pension') {
                    salary = nhsJobsGross || bucket.nhsSalary || bucket.dbSalary || 0;
                    yearsAtRetirement = (bucket.nhsYearsService || bucket.dbYearsService || 0) + projectionYears;
                    const scheme = bucket.nhsScheme || bucket.dbScheme || "2015";
                    accrual = scheme === "1995" ? 80 : scheme === "2008" ? 60 : 54;
                } else if (bucket.type === 'civil-service-pension') {
                    salary = civilServiceJobsGross || bucket.dbSalary || 0;
                    const scheme = bucket.dbScheme || "alpha";
                    accrual = scheme === "classic" ? 80 : (scheme === "premium" || scheme === "nuvos") ? 60 : 43.1;
                } else if (bucket.type === 'teachers-pension') {
                    salary = teachersJobsGross || bucket.dbSalary || 0;
                    const scheme = bucket.dbScheme || "2015";
                    accrual = (scheme === "classic" || scheme === "80th") ? 80 : scheme === "60th" ? 60 : 57;
                }
                dbIncome = (salary / accrual) * yearsAtRetirement;
            }

            return (
              <React.Fragment key={bucket.id}>
                {/* Main Row */}
                <div 
                  className={`table-row ${bucket.isHidden ? "deselected" : ""}`}
                  style={{ 
                    display: 'grid', 
                    gridTemplateColumns: '40px 1.5fr 1fr 1fr 1fr 1fr 40px', 
                    gap: '10px', 
                    alignItems: 'center',
                    padding: '8px 0'
                  }}
                >
                  <div><div className="mobile-label">Show</div><input
                    type="checkbox"
                    checked={!bucket.isHidden}
                    onChange={() => setSavings(updateItem(savings, bucket.id, { isHidden: !bucket.isHidden }))}
                  /></div>
                  <div><div className="mobile-label">Bucket Name</div><TextInput placeholder="e.g. ISA" value={bucket.label} onChange={(label) => setSavings(updateItem(savings, bucket.id, { label }))} /></div>
                  <div><div className="mobile-label">Type</div>
                    <select value={bucket.type} onChange={(event) => setSavings(updateItem(savings, bucket.id, { type: event.target.value as SavingsBucket["type"] }))}>
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
                  <div><div className="mobile-label">Balance</div><NumberInput placeholder="0" value={bucket.balance} onChange={(balance) => setSavings(updateItem(savings, bucket.id, { balance }))} /></div>
                  <div><div className="mobile-label">Monthly</div><NumberInput 
                    placeholder="0"
                    value={parseFloat(bucket.monthly.toFixed(2))} 
                    onChange={(monthly) => setSavings(updateItem(savings, bucket.id, { monthly }))} 
                  /></div>
                  <div><div className="mobile-label">Growth Rate</div><NumberInput placeholder="0" value={bucket.annualRate} onChange={(annualRate) => setSavings(updateItem(savings, bucket.id, { annualRate }))} suffix="%" /></div>
                  <button className="delete-btn" onClick={() => setSavings(savings.filter((s: any) => s.id !== bucket.id))}>×</button>
                </div>

                {/* DB Sub-Panel */}
                {isDbPension && (
                  <div style={{ gridColumn: '1 / -1', background: '#f8fbfd', padding: '16px', borderBottom: '1px solid #e2e8f0' }}>
                    <h4 style={{ margin: '0 0 12px 0', fontSize: '0.8rem', color: '#2c5282', letterSpacing: '0.05em' }}>PENSION CONFIGURATION</h4>
                    <div className="settings-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
                      <label>Annual Salary <NumberInput placeholder="0" value={bucket.dbSalary || bucket.nhsSalary || 0} onChange={(val) => setSavings(updateItem(savings, bucket.id, { dbSalary: val }))} /></label>
                      <label>Service Years <NumberInput placeholder="0" value={bucket.dbYearsService || bucket.nhsYearsService || 0} onChange={(val) => setSavings(updateItem(savings, bucket.id, { dbYearsService: val }))} /></label>
                      <label>Scheme
                        <select style={{ width: '100%', marginTop: '4px' }} value={bucket.dbScheme || bucket.nhsScheme || "2015"} onChange={(e) => setSavings(updateItem(savings, bucket.id, { dbScheme: e.target.value as any }))}>
                          {bucket.type === 'nhs-pension' && (
                            <>
                              <option value="1995">1995 Scheme (1/80)</option>
                              <option value="2008">2008 Scheme (1/60)</option>
                              <option value="2015">2015 Scheme (1/54)</option>
                            </>
                          )}
                          {bucket.type === 'civil-service-pension' && (
                            <>
                              <option value="alpha">Alpha (2.32%)</option>
                              <option value="classic">Classic (1/80)</option>
                              <option value="premium">Premium/Nuvos (1/60)</option>
                            </>
                          )}
                          {bucket.type === 'teachers-pension' && (
                            <>
                              <option value="2015">TPS 2015 (1/57)</option>
                              <option value="classic">TPS Final Salary (1/80)</option>
                              <option value="60th">TPS Final Salary (1/60)</option>
                            </>
                          )}
                        </select>
                      </label>
                    </div>
                    <div style={{ marginTop: '12px', padding: '10px', background: '#ebf4ff', borderRadius: '4px' }}>
                       <strong>Estimated Annual Benefit:</strong> <span style={{ color: '#2b6cb0', fontSize: '1.1rem', fontWeight: 700 }}>{money.format(dbIncome)} / year</span>
                    </div>
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>

        <button 
          style={{ marginTop: '16px' }}
          onClick={() => setSavings([...savings, { id: uid(), label: "New savings bucket", balance: 0, monthly: 0, annualRate: 3, type: "cash" }])}
        >
          Add savings bucket
        </button>

        <div className="callout" style={{ marginTop: '20px' }}>
          <strong>{monthlyMoney.format(employmentPensionMonthly + employerPensionMonthly)}</strong>
          <span> monthly workplace pension projection includes employee deductions + employer contributions.</span>
        </div>
      </section>

      <section className="panel span-12">
        <div className="projection-bars">
          {projectedSavings.map((bucket) => (
            <div className={`projection-row ${bucket.isHidden ? "deselected" : ""}`} key={bucket.id}>
              <div style={{ minWidth: '150px' }}>
                <strong>{bucket.label}</strong>
              </div>
              <div className="bar-track" style={{ flex: 1, margin: '0 20px' }}>
                <div style={{ width: `${Math.max(2, (bucket.projected / Math.max(1, allProjectedTotal)) * 100)}%` }} />
              </div>
              <b style={{ minWidth: '100px', textAlign: 'right' }}>{money.format(bucket.projected)}</b>
            </div>
          ))}
        </div>
        <div style={{ borderTop: '1px solid #eee', marginTop: '20px', paddingTop: '15px' }}>
          <Metric label={`Projected total in ${projectionYears} years`} value={money.format(projectedTotal)} tone="green" />
        </div>
      </section>
    </div>
  );
}

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

function Metric({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "green" | "amber" | "red" }) {
  return (
    <article className={`metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function PanelHeader({ title, actionLabel, onAction }: { title: string; actionLabel: string; onAction: () => void }) {
  return (
    <div className="split-title">
      <h2>{title}</h2>
      <button onClick={onAction}>{actionLabel}</button>
    </div>
  );
}

function TextInput({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <input placeholder={placeholder} value={value} onChange={(event) => onChange(event.target.value)} />;
}

function NumberInput({ value, onChange, suffix, placeholder }: { value: number; onChange: (value: number) => void; suffix?: string; placeholder?: string }) {
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

function ResultRows({ rows }: { rows: [string, number][] }) {
  const filteredRows = rows.filter(([_, value]) => Math.abs(value) >= 0.01);
  return (
    <div className="result-rows">
      {filteredRows.map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <strong>{money.format(value)}</strong>
        </div>
      ))}
    </div>
  );
}

function BandChart({ bands }: { bands: { label: string; taxable: number; tax: number; rate: number }[] }) {
  const maxTaxable = Math.max(1, ...bands.map((band) => band.taxable));
  return (
    <div className="band-chart">
      {bands.map((band) => (
        <div key={band.label}>
          <span>{band.label}</span>
          <div className="bar-track">
            <div style={{ width: `${Math.max(2, (band.taxable / maxTaxable) * 100)}%` }} />
          </div>
          <b>{Math.round(band.rate * 100)}%</b>
        </div>
      ))}
    </div>
  );
}

function updateItem<T extends { id: string }>(items: T[], id: string, patch: Partial<T>) {
  return items.map((item) => (item.id === id ? { ...item, ...patch } : item));
}

function updateExpense(
  streamId: string,
  expenseId: string,
  patch: { label?: string; amount?: number },
  streams: SelfEmployment[],
  setStreams: React.Dispatch<React.SetStateAction<SelfEmployment[]>>,
) {
  setStreams(
    streams.map((stream) =>
      stream.id === streamId
        ? {
            ...stream,
            expenses: stream.expenses.map((expense) => (expense.id === expenseId ? { ...expense, ...patch } : expense)),
          }
        : stream,
    ),
  );
}

function DepletionChart({ 
  projectedSavings, 
  drawdownSettings, 
  retirementAge, 
  pensionAccessAge,
}: any) {
  const years = [0, 5, 10, 15, 20, 25, 30];
  const colors = ['#2c7363', '#a26013', '#a7332f', '#4a5568', '#3182ce', '#805ad5', '#d53f8c', '#e6a23c', '#67c23a'];

  const isAccessible = (type: string, age: number) => {
    if (type === 'lisa') return age >= 60;
    if (type === 'pension' || type === 'workplace-private-pension') return age >= pensionAccessAge;
    if (['nhs-pension', 'civil-service-pension', 'teachers-pension'].includes(type)) return age >= 67;
    return true;
  };

  const data = years.map(year => {
    const age = Math.round(retirementAge + year);
    const buckets = projectedSavings
      .filter((b: any) => !['nhs-pension', 'civil-service-pension', 'teachers-pension'].includes(b.type) && !b.isHidden)
      .map((bucket: any) => {
        const settings = drawdownSettings[bucket.id] || { enabled: true, rate: 4 };
        const r = bucket.annualRate / 100;
        let balance;
        
        if (!settings.enabled) {
          balance = bucket.projected * Math.pow(1 + r, year);
        } else if (!isAccessible(bucket.type, age)) {
          balance = bucket.projected * Math.pow(1 + r, year);
        } else {
          const d = bucket.projected * (settings.rate / 100);
          if (r === 0) {
            balance = bucket.projected - d * year;
          } else {
            balance = bucket.projected * Math.pow(1 + r, year) - d * (Math.pow(1 + r, year) - 1) / r;
          }
        }
        return { label: bucket.label, value: Math.max(0, balance) };
      });
    return { year, age, buckets };
  });

  if (data[0].buckets.length === 0) return null;

  return (
    <div className="depletion-chart" style={{ marginTop: '24px' }}>
      <h3>Pot Depletion Projection</h3>
      <LineChart data={data} years={years} colors={colors} />
    </div>
  );
}

function LineChart({ data, years, colors }: any) {
  const width = 800;
  const height = 400;
  const padding = 60;
  
  const allValues = data.flatMap((d: any) => d.buckets.map((b: any) => b.value));
  const maxVal = Math.max(1000, ...allValues);
  
  const getX = (year: number) => padding + (year / years[years.length - 1]) * (width - 2 * padding);
  const getY = (val: number) => height - padding - (val / maxVal) * (height - 2 * padding);

  const bucketNames = data[0].buckets.map((b: any) => b.label);

  return (
    <div className="line-chart-container">
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', background: '#fffaf1', borderRadius: '8px', border: '1px solid #e7e0d5' }}>
        {/* Axes */}
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#ccc" strokeWidth="1" />
        <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="#ccc" strokeWidth="1" />
        
        {/* Grid lines & Y labels */}
        {[0, 0.25, 0.5, 0.75, 1].map(p => (
          <g key={p}>
             <line x1={padding} y1={getY(maxVal * p)} x2={width - padding} y2={getY(maxVal * p)} stroke="#f0ece4" strokeDasharray="4" />
             <text x={padding - 10} y={getY(maxVal * p) + 4} textAnchor="end" fontSize="11" fill="#888">{money.format(maxVal * p)}</text>
          </g>
        ))}

        {/* X labels */}
        {data.map((d: any) => (
          <g key={d.year}>
            <text x={getX(d.year)} y={height - padding + 20} textAnchor="middle" fontSize="11" fill="#888">+{d.year}y</text>
            <text x={getX(d.year)} y={height - padding + 35} textAnchor="middle" fontSize="10" fill="#aaa">Age {d.age}</text>
          </g>
        ))}

        {/* Lines */}
        {bucketNames.map((name: string, i: number) => {
          const points = data.map((d: any) => {
             const bucket = d.buckets.find((b: any) => b.label === name);
             return `${getX(d.year)},${getY(bucket.value)}`;
          }).join(' ');
          return (
            <polyline
              key={name}
              fill="none"
              stroke={colors[i % colors.length]}
              strokeWidth="3"
              strokeLinejoin="round"
              strokeLinecap="round"
              points={points}
            />
          );
        })}
      </svg>
      <div className="chart-legend" style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '14px', justifyContent: 'center' }}>
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

createRoot(document.getElementById("root")!).render(<App />);
