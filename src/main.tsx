const uid = () => crypto.randomUUID();
import React, { useMemo, useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import {
  auth,
  db,
} from "./firebase";
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
  calculateNationalInsurance,
  calculateMortgage,
  calculateCoastFire,
  calculateFullFire,
  calculatePVBridge,
  calculateMortgageUpdate,
  calculateTaxSummary,
  clampNumber,
  money,
  monthlyMoney,
  projectSavings,
  requiredGrossForNet,
  calculateNhsEmployeeRate,
  calculateCivilServiceEmployeeRate,
  calculateTeachersEmployeeRate,
  calculatePoliceEmployeeRate,
  calculateFirefightersEmployeeRate,
  calculateLgpsEmployeeRate,
  NHS_EMPLOYER_RATE,
  calculateRetirementGrossRequired,
  calculateCurrentBucketValue,
  getFinancialSnapshot,
  isBucketAccessible,
  FinancialSnapshot,
  calculateGrowthSinceLastUpdate,
  getPendingMonthlyContributions,
  generateSavingsCSV,
  generatePotGrowthTable,
  PotGrowthRow,
  generateExcelPlanTable,
  ExcelPlanRow,
  runMonteCarloSimulation,
  MonteCarloResult,
  AnnualContributionSchedule,
} from "./calculations";
import "./styles.css";


export function updateItem<T extends { id: string }>(items: T[], id: string, patch: Partial<T>) {
  return items.map((item) => (item.id === id ? { ...item, ...patch } : item));
}

export const isMobile = window.innerWidth <= 600;

function TextInput({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <input placeholder={placeholder} value={value} onChange={(event) => onChange(event.target.value)} />;
}

export function NumberInput({ value, onChange, suffix, placeholder, max }: { value: number; onChange: (value: number) => void; suffix?: string; placeholder?: string; max?: number }) {
  const [localValue, setLocalValue] = useState<string>(
    value !== undefined && value !== null ? (Math.round(value * 100) / 100).toString() : ""
  );

  useEffect(() => {
    if (value !== undefined && value !== null) {
      const rounded = Math.round(value * 100) / 100;
      if (parseFloat(localValue) !== rounded) {
        setLocalValue(rounded.toString());
      }
    } else {
      setLocalValue("");
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value;
    setLocalValue(rawVal);
    if (rawVal === "") {
      onChange(0);
      return;
    }
    let val = Number(rawVal);
    if (!isNaN(val)) {
      if (max !== undefined) val = Math.min(val, max);
      val = Math.round(val * 100) / 100;
      onChange(val);
    }
  };

  const handleBlur = () => {
    if (localValue !== "") {
      const val = Math.round(Number(localValue) * 100) / 100;
      setLocalValue(val.toString());
    }
  };

  return (
    <span className="number-field">
      <input
        type="number"
        step="any"
        placeholder={placeholder}
        value={localValue}
        onChange={handleChange}
        onBlur={handleBlur}
      />
      {suffix ? <span>{suffix}</span> : null}
    </span>
  );
}

export function Metric({ label, value, tone = "neutral", detail }: { label: string; value: string; tone?: string; detail?: string }) {
  return (
    <article className={`metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail && <small style={{ fontSize: '0.65rem', display: 'block', marginTop: '4px', opacity: 0.8 }}>{detail}</small>}
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
      {filteredRows.map(([label, value], i) => (
        <div key={`${label}-${i}`}>
          <span>{label}</span>
          <strong>{typeof value === 'number' ? money.format(value) : value}</strong>
        </div>
      ))}
    </div>
  );
}

// ... rest of imports ...
type SectionId = "overview" | "income" | "tax" | "budget" | "savings" | "mortgage" | "retirement" | "coastfire" | "assets" | "profile" | "settings";

function AssetsSection({ assets, setAssets }: { assets: Asset[]; setAssets: React.Dispatch<React.SetStateAction<Asset[]>> }) {
  const addAsset = () => setAssets([...assets, { id: uid(), label: "New Asset", value: 0 }]);
  const updateAsset = (id: string, patch: Partial<Asset>) => {
    setAssets(assets.map(a => (a.id === id ? { ...a, ...patch } : a)));
  };
  const removeAsset = (id: string) => setAssets(assets.filter(a => a.id !== id));

  return (
    <div className="workspace">
      <section className="panel span-12">
        <h2>Large Assets</h2>
        <div className="budget-lines">
          {assets.map((asset) => (
            <div key={asset.id} className="budget-row">
              <div className="label-field">
                <TextInput value={asset.label} onChange={(label) => updateAsset(asset.id, { label })} />
              </div>
              <div className="amount-field" style={{ gridColumn: 'span 3' }}>
                <NumberInput value={asset.value} onChange={(value) => updateAsset(asset.id, { value })} />
              </div>
              <button className="delete-btn" onClick={() => removeAsset(asset.id)}>×</button>
            </div>
          ))}
          <button className="wide-action" onClick={addAsset}>+ Add Asset</button>
        </div>
      </section>
    </div>
  );
}


export type Asset = {
  id: string;
  label: string;
  value: number;
};

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
    assets: Asset[];
    projectionYears: number;
    mortgages: MortgageInputs[];
    mortgage?: MortgageInputs;
    birthYear: number;
    birthMonth: number;
    retirementAge: number;
    targetCoastAge?: number;
    expectedOutgoings: number;
    otherRetirementIncome: (ExpenseLine & { isTaxable?: boolean })[];
    drawdownRate: number;
    drawdownSettings: Record<string, { enabled: boolean; rate: number; lumpSumTaken?: boolean; useWithdrawAge?: boolean; withdrawAge?: number; useStopAge?: boolean; stopAge?: number }>;
    inflationRate: number;
    additionalRetirementExpenses: ExpenseLine[];
    retirementTaxableFraction?: number;
    showLisaUnder60?: boolean;
    includeStatePension?: boolean;
    annualStatePension?: number;
    showMortgageCard?: boolean;
    showAssetsCard?: boolean;
    showCoastFireCard?: boolean;
    swr?: number;
    realGrowth?: number;
    firePassiveIncome?: number;
    pensionTaxMethod?: 'ufpls' | 'lump-sum';
    volatility?: number;
    coastTargetType?: 'current' | 'retirement';
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
  const [excludedBudgetLines, setExcludedBudgetLines] = useState<string[]>([]);
  const [excludedSavings, setExcludedSavings] = useState<string[]>([]);
  const [annualBills, setAnnualBills] = useState(initialAnnualBills);
  const [savings, setSavings] = useState(initialSavings);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [projectionYears, setProjectionYears] = useState(10);
  const [mortgages, setMortgages] = useState<MortgageInputs[]>([{ amount: 0, annualRate: 4, years: 25, monthlyOverpayment: 0, oneOffMonth: 0, oneOffAmount: 0, paymentDay: 1 }]);

  const [birthYear, setBirthYear] = useState(1990);
  const [birthMonth, setBirthMonth] = useState(1);
  const [targetCoastAge, setTargetCoastAge] = useState(50);
  const [coastTargetType, setCoastTargetType] = useState<'current' | 'retirement'>('current');
  const [expectedOutgoings, setExpectedOutgoings] = useState(0);
  const [drawdownRate, setDrawdownRate] = useState(4); // Defaulting to 4%
  const [otherRetirementIncome, setOtherRetirementIncome] = useState<(ExpenseLine & { isTaxable?: boolean })[]>([]);
  const [drawdownSettings, setDrawdownSettings] = useState<Record<string, { enabled: boolean; rate: number; lumpSumTaken?: boolean; useWithdrawAge?:any; withdrawAge?:any; useStopAge?:any; stopAge?:any }>>({});
  const [inflationRate, setInflationRate] = useState(3);
  const [additionalRetirementExpenses, setAdditionalRetirementExpenses] = useState<ExpenseLine[]>([]);
  const [retirementTaxableFraction, setRetirementTaxableFraction] = useState(0.75);
  const [showLisaUnder60, setShowLisaUnder60] = useState(true);
  const [includeStatePension, setIncludeStatePension] = useState(true);
  const [annualStatePension, setAnnualStatePension] = useState(12547.60);
  const [showMortgageCard, setShowMortgageCard] = useState(true);
  const [showAssetsCard, setShowAssetsCard] = useState(true);
  const [showCoastFireCard, setShowCoastFireCard] = useState(true);
  const [swr, setSwr] = useState(4);
  const [realGrowth, setRealGrowth] = useState(3);
  const [firePassiveIncome, setFirePassiveIncome] = useState(0);
  const [pensionTaxMethod, setPensionTaxMethod] = useState<'ufpls' | 'lump-sum'>("ufpls");
  const [volatility, setVolatility] = useState<number>(12);

  const [pendingContributions, setPendingContributions] = useState<{bucketId: string, count: number, totalAmount: number}[]>([]);
  const [pendingMortgageUpdate, setPendingMortgageUpdate] = useState<{months: number, newBalance: number, payments: number} | null>(null);
  const hasMortgages = mortgages.length > 0;
  
  // Auto-activate mortgage card if it's off but mortgages exist, or prompt to add if empty and card is on
  useEffect(() => {
    if (hasMortgages && !showMortgageCard) {
      setShowMortgageCard(true);
    }
  }, [hasMortgages, showMortgageCard]);

  const addDefaultMortgage = () => {
    setMortgages([{ amount: 200000, annualRate: 4, years: 25, monthlyOverpayment: 0, oneOffMonth: 0, oneOffAmount: 0, paymentDay: 1 }]);
    setShowMortgageCard(true);
  };

  const hasCheckedGrowth = React.useRef(false);

  const confirmContributions = () => {
    const today = new Date().toISOString().split('T')[0];
    const newSavings = savings.map(s => {
      const p = pendingContributions.find(pc => pc.bucketId === s.id);
      if (p) {
        return {
          ...s,
          balance: s.balance + p.totalAmount,
          totalContributed: (s.totalContributed || s.balance) + p.totalAmount,
          lastUpdated: today
        };
      }
      return s;
    });
    setSavings(newSavings);

    if (pendingMortgageUpdate) {
      setMortgages(mortgages.map(m => ({
        ...m,
        amount: pendingMortgageUpdate.newBalance,
        years: Math.max(0, m.years - (pendingMortgageUpdate.months / 12)),
        oneOffMonth: Math.max(0, m.oneOffMonth - pendingMortgageUpdate.months),
        lastUpdated: today
      })));
      setPendingMortgageUpdate(null);
    }

    setPendingContributions([]);
  };

  useEffect(() => {
    if (!authLoading && user && !hasCheckedGrowth.current && savings.length > 0) {
      const today = new Date();
      let updated = false;
      const newSavings = savings.map(s => {
        const { growth, days } = calculateGrowthSinceLastUpdate(s, today);
        if (days > 0) {
          updated = true;
          return {
            ...s,
            balance: s.balance + growth,
            lastUpdated: today.toISOString().split('T')[0]
          };
        }
        return s;
      });

      if (updated) {
        setSavings(newSavings);
      }
      
      const pending = savings.map(s => {
        const count = getPendingMonthlyContributions(s, today);
        if (count > 0) {
          return { bucketId: s.id, count, totalAmount: s.monthly * count };
        }
        return null;
      }).filter(Boolean) as {bucketId: string, count: number, totalAmount: number}[];

      setPendingContributions(pending);

      // Check for mortgage updates
      const mortgageUpdate = mortgages.length > 0 ? calculateMortgageUpdate(mortgages[0], today) : { monthsElapsed: 0 };
      if (mortgageUpdate.monthsElapsed > 0 && 'newBalance' in mortgageUpdate) {
        setPendingMortgageUpdate({
          months: mortgageUpdate.monthsElapsed,
          newBalance: mortgageUpdate.newBalance,
          payments: mortgageUpdate.paymentsMade
        });
      }

      hasCheckedGrowth.current = true;
    }
  }, [authLoading, user, savings, mortgages]);

  const STATE_PENSION_AGE = 67;

  const loadDemoScenario = (scenario: 'nurse' | 'banker' | 'plumber' | 'analyst') => {
    if (!confirmUnsavedChanges()) return;
    setCurrentPlanId(null);
    
    // Reset all state to defaults before seeding
    setPaye([]);
    setSelfEmployment([]);
    setBudgetLines([]);
    setAnnualBills([]);
    setSavings([]);
    setAssets([]);
    setOtherRetirementIncome([]);
    setAdditionalRetirementExpenses([]);
    setMortgages([]);

    if (scenario === 'nurse') {
      setPaye([
        { id: uid(), label: "NHS Senior Nurse", gross: 48500, pensionType: "nhs", pensionRate: 9.8, employerPensionContribution: 23.7 },
        { id: uid(), label: "Evening Tutoring", gross: 5000, pensionType: "standard", pensionRate: 5, employerPensionContribution: 3 }
      ]);
      setSelfEmployment([
        { id: uid(), label: "Freelance Writing", gross: 12000, isNiLiable: true, expenses: [
          { id: uid(), label: "Software", amount: 500, bucket: "professional" }
        ]}
      ]);
      setTaxSettings(prev => ({ ...prev, includeStudentLoan: true }));
      setSavings([
        { id: uid(), label: "S&S ISA", balance: 25000, monthly: 250, annualRate: 7, type: "isa", totalContributed: 20000 },
        { id: uid(), label: "Lifetime ISA", balance: 8000, monthly: 100, annualRate: 5, type: "lisa", totalContributed: 6000 },
        { id: uid(), label: "NHS Pension", balance: 0, monthly: 0, annualRate: 0, type: "nhs-pension", dbScheme: "2015", dbYearsService: 5 }
      ]);
      setBirthYear(1992);
      setProjectionYears(28);
      alert("Scenario Loaded: 34-year-old NHS Nurse with side hustles.");
    } else if (scenario === 'banker') {
      setPaye([
        { id: uid(), label: "Investment Director", gross: 165000, pensionType: "standard", pensionRate: 10, employerPensionContribution: 15 }
      ]);
      setSavings([
        { id: uid(), label: "Main SIPP", balance: 850000, monthly: 2000, annualRate: 6, type: "pension", totalContributed: 400000 },
        { id: uid(), label: "GIA (Cash)", balance: 150000, monthly: 0, annualRate: 4, type: "cash", totalContributed: 150000 },
        { id: uid(), label: "Maxed ISA", balance: 240000, monthly: 1666, annualRate: 7, type: "isa", totalContributed: 180000 }
      ]);
      setBirthYear(1966);
      setProjectionYears(5);
      setTaxSettings(prev => ({ ...prev, includeStudentLoan: false }));
      alert("Scenario Loaded: 60-year-old Banker with healthy assets.");
    } else if (scenario === 'plumber') {
      setSelfEmployment([
        { id: uid(), label: "Plumbing Services", gross: 55000, isNiLiable: true, expenses: [
          { id: uid(), label: "Van & Tools", amount: 8000, bucket: "professional" }
        ]}
      ]);
      setSavings([
        { id: uid(), label: "Armed Forces Pension", balance: 0, monthly: 0, annualRate: 0, type: "armed-forces-pension", dbScheme: "2015", dbYearsService: 10 },
        { id: uid(), label: "Vanguard ISA", balance: 45000, monthly: 500, annualRate: 8, type: "isa", totalContributed: 35000 },
        { id: uid(), label: "Emergency Fund", balance: 15000, monthly: 0, annualRate: 4, type: "cash", totalContributed: 15000 }
      ]);
      setBirthYear(1986);
      setProjectionYears(25);
      setTaxSettings(prev => ({ ...prev, includeStudentLoan: false }));
      alert("Scenario Loaded: 40-year-old Plumber (ex-Armed Forces).");
    } else if (scenario === 'analyst') {
      setPaye([
        { id: uid(), label: "Junior Data Analyst", gross: 32000, pensionType: "standard", pensionRate: 5, employerPensionContribution: 3 }
      ]);
      setTaxSettings(prev => ({ ...prev, includeStudentLoan: true }));
      setSavings([
        { id: uid(), label: "Workplace Pension", balance: 4500, monthly: 250, annualRate: 6, type: "workplace-private-pension", totalContributed: 4000 },
        { id: uid(), label: "First Home Fund", balance: 2000, monthly: 200, annualRate: 5, type: "lisa", totalContributed: 2000 }
      ]);
      setBirthYear(2001);
      setProjectionYears(42);
      alert("Scenario Loaded: 25-year-old Analyst with student loans.");
    }

    setBudgetLines([
      { id: uid(), label: "Groceries", amount: 450, bucket: "food", includeInRetirement: true },
      { id: uid(), label: "Council Tax", amount: 160, bucket: "housing", includeInRetirement: true },
      { id: uid(), label: "Energy", amount: 180, bucket: "housing", includeInRetirement: true }
    ]);
    setMortgages([{ amount: 200000, annualRate: 4.2, years: 25, monthlyOverpayment: 0, oneOffMonth: 0, oneOffAmount: 0, paymentDay: 1 }]);
    setExpectedOutgoings(2500);
    setDrawdownRate(4);
    setInflationRate(3);
  };

  const currentDataString = useMemo(() => JSON.stringify({
    paye,
    selfEmployment,
    taxSettings,
    budgetLines,
    annualBills,
    savings,
    projectionYears,
    mortgages,
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
    includeStatePension,
    annualStatePension,
    showMortgageCard,
    showAssetsCard,
    showCoastFireCard,
    swr,
    realGrowth,
    targetCoastAge,
    coastTargetType,
  }), [
    paye, selfEmployment, taxSettings, budgetLines, annualBills, savings,
    projectionYears, mortgages, birthYear, birthMonth, expectedOutgoings,
    drawdownRate, otherRetirementIncome, drawdownSettings, inflationRate,
    additionalRetirementExpenses, retirementTaxableFraction, showLisaUnder60,
    includeStatePension, annualStatePension, showMortgageCard, showAssetsCard, showCoastFireCard, swr, realGrowth,
    targetCoastAge, coastTargetType
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
    hasCheckedGrowth.current = false;
    const d = plan.data;
    setPaye(d.paye);
    setSelfEmployment(d.selfEmployment);
    setTaxSettings(d.taxSettings);
    setBudgetLines(d.budgetLines);
    setAnnualBills(d.annualBills);
    setSavings(d.savings);
    setAssets(d.assets || []);
    setProjectionYears(d.projectionYears);
    // Handle both new 'mortgages' array and legacy 'mortgage' object
    if (d.mortgages) {
      setMortgages(d.mortgages);
    } else if (d.mortgage) {
      setMortgages([d.mortgage]);
    } else {
      setMortgages([]);
    }
    setBirthYear(d.birthYear || 1990);
    setBirthMonth(d.birthMonth || 1);
    setTargetCoastAge(d.targetCoastAge ?? 50);
    setExpectedOutgoings(d.expectedOutgoings || 0);
    setDrawdownRate(d.drawdownRate || 4);
    setOtherRetirementIncome(d.otherRetirementIncome || []);
    setDrawdownSettings(d.drawdownSettings || {});
    setInflationRate(d.inflationRate ?? 3);
    setAdditionalRetirementExpenses(d.additionalRetirementExpenses || []);
    setRetirementTaxableFraction(d.retirementTaxableFraction ?? 0.75);
    setShowLisaUnder60(d.showLisaUnder60 ?? true);
    setIncludeStatePension(d.includeStatePension ?? true);
    setAnnualStatePension(d.annualStatePension ?? 12547.60);
    setShowMortgageCard(d.showMortgageCard ?? true);
    setShowAssetsCard(d.showAssetsCard ?? true);
    setShowCoastFireCard(d.showCoastFireCard ?? true);
    setSwr(d.swr ?? 4);
    setRealGrowth(d.realGrowth ?? 3);
    setFirePassiveIncome(d.firePassiveIncome ?? 0);
    setPensionTaxMethod(d.pensionTaxMethod ?? 'ufpls');
    setVolatility(d.volatility ?? 12);
    
    // Normalize and set lastSavedData
    setLastSavedData(JSON.stringify({
      paye: d.paye,
      selfEmployment: d.selfEmployment,
      taxSettings: d.taxSettings,
      budgetLines: d.budgetLines,
      annualBills: d.annualBills,
      savings: d.savings,
      projectionYears: d.projectionYears,
      mortgages: mortgages,
      birthYear: d.birthYear || 1990,
      birthMonth: d.birthMonth || 1,
      targetCoastAge: d.targetCoastAge ?? 50,
      expectedOutgoings: d.expectedOutgoings || 0,
      drawdownRate: d.drawdownRate || 4,
      otherRetirementIncome: d.otherRetirementIncome || [],
      drawdownSettings: d.drawdownSettings || {},
      inflationRate: d.inflationRate ?? 3,
      additionalRetirementExpenses: d.additionalRetirementExpenses || [],
      retirementTaxableFraction: d.retirementTaxableFraction ?? 0.75,
      showLisaUnder60: d.showLisaUnder60 ?? true,
      includeStatePension: d.includeStatePension ?? true,
      annualStatePension: d.annualStatePension ?? 12547.60,
      showMortgageCard: d.showMortgageCard ?? true,
      showCoastFireCard: d.showCoastFireCard ?? true,
      swr: d.swr ?? 4,
      realGrowth: d.realGrowth ?? 3,
      firePassiveIncome: d.firePassiveIncome ?? 0,
      pensionTaxMethod: d.pensionTaxMethod ?? 'ufpls',
      volatility: d.volatility ?? 12,
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
      assets,
      projectionYears,
      mortgages,
      birthYear,
      birthMonth,
      targetCoastAge,
      expectedOutgoings,
      drawdownRate,
      otherRetirementIncome,
      drawdownSettings,
      inflationRate,
      additionalRetirementExpenses,
      retirementTaxableFraction,
      showLisaUnder60,
      includeStatePension,
      annualStatePension,
      showMortgageCard,
      showAssetsCard,
      showCoastFireCard,
      firePassiveIncome,
      pensionTaxMethod,
      volatility,
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
    hasCheckedGrowth.current = false;
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
    setAssets([]);
    setProjectionYears(10);
    setMortgages([]);
    setBirthYear(1990);
    setBirthMonth(1);
    setTargetCoastAge(50);
    setExpectedOutgoings(0);
    setDrawdownRate(4);
    setOtherRetirementIncome([]);
    setDrawdownSettings({});
    setInflationRate(3);
    setAdditionalRetirementExpenses([]);
    setRetirementTaxableFraction(0.75);
    setShowLisaUnder60(true);
    setIncludeStatePension(true);
    setShowMortgageCard(true);
    setShowAssetsCard(true);
    setShowCoastFireCard(false);
    
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
      assets: [],
      projectionYears: 10,
      mortgages: [],
      birthYear: 1990,
      birthMonth: 1,
      targetCoastAge: 50,
      expectedOutgoings: 0,
      drawdownRate: 4,
      otherRetirementIncome: [],
      drawdownSettings: {},
      inflationRate: 3,
      additionalRetirementExpenses: [],
      retirementTaxableFraction: 0.75,
      showLisaUnder60: true,
      includeStatePension: true,
      annualStatePension: 12547.60,
      showMortgageCard: true,
      showAssetsCard: false,
      showCoastFireCard: false,
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
    () => calculateTaxSummary(paye, selfEmployment, savings, { ...taxSettings, sippNetContribution: totalSippNet }),
    [paye, selfEmployment, savings, taxSettings, totalSippNet],
  );

  const savingsForBudget = useMemo(
    () => savings.filter((bucket) => !["workplace-private-pension", "nhs-pension", "civil-service-pension", "teachers-pension"].includes(bucket.type) && !bucket.isHidden),
    [savings],
  );

const projectionBuckets = useMemo(() => {
    return savings;
  }, [savings]);
  const budget = useMemo(
    () => budgetSummary(tax.monthlyNet, budgetLines, annualBills, savingsForBudget, mortgages.reduce((sum, m) => sum + m.monthlyOverpayment, 0)),
    [tax.monthlyNet, budgetLines, annualBills, savingsForBudget, mortgages],
  );

  const filteredBudgetLines = useMemo(() => {
    return budgetLines.filter(l => !excludedBudgetLines.includes(l.id));
  }, [budgetLines, excludedBudgetLines]);

  const filteredSavingsForBudget = useMemo(() => {
    return savingsForBudget.filter(s => !excludedSavings.includes(s.id));
  }, [savingsForBudget, excludedSavings]);

  const activeMortgageOverpayment = useMemo(() => {
    return !excludedSavings.includes('mortgage-overpayment') ? mortgages.reduce((sum, m) => sum + m.monthlyOverpayment, 0) : 0;
  }, [excludedSavings, mortgages]);

  const includedBudget = useMemo(
    () => budgetSummary(tax.monthlyNet, filteredBudgetLines, annualBills, filteredSavingsForBudget, activeMortgageOverpayment),
    [tax.monthlyNet, filteredBudgetLines, annualBills, filteredSavingsForBudget, activeMortgageOverpayment],
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
  const mortgageSummaries = useMemo(() => mortgages.map(m => calculateMortgage(m)), [mortgages]);
  const targetGross = useMemo(
    () => requiredGrossForNet(
      Math.max(0, includedBudget.monthlyOut * 12), 
      taxSettings.taxCode, 
      taxSettings.region,
      taxSettings.includeStudentLoan,
      taxSettings.pensionRate
    ),
    [includedBudget.monthlyOut, taxSettings],
  );
  const projectedTotal = projectedSavings.reduce((sum, bucket) => {
    return bucket.isHidden ? sum : sum + bucket.projected;
  }, 0);
  const allProjectedTotal = projectedSavings.reduce((sum, bucket) => sum + bucket.projected, 0);

  const currentAge = (new Date().getFullYear() - birthYear) + (new Date().getMonth() + 1 - birthMonth) / 12;
  const targetRetirementAge = currentAge + projectionYears;
  const retirementAge = targetRetirementAge;
  const clampedRetirementAge = Math.max(currentAge, targetRetirementAge);
  const clampedProjectionYears = Math.max(0, projectionYears);

  const accessibleProjectedTotal = useMemo(() => {
    return projectedSavings.reduce((sum, bucket) => {
      if (bucket.isHidden) return sum;
      // We check accessibility at the END of the projection (retirementAge)
      if (isBucketAccessible(bucket, retirementAge)) {
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

  const policeJobsGross = useMemo(() => {
    return paye.filter(j => j.pensionType === 'police').reduce((sum, j) => sum + j.gross, 0);
  }, [paye]);

  const firefightersJobsGross = useMemo(() => {
    return paye.filter(j => j.pensionType === 'firefighters').reduce((sum, j) => sum + j.gross, 0);
  }, [paye]);

  const armedForcesJobsGross = useMemo(() => {
    return paye.filter(j => j.pensionType === 'armed-forces').reduce((sum, j) => sum + j.gross, 0);
  }, [paye]);

  const lgpsJobsGross = useMemo(() => {
    return paye.filter(j => j.pensionType === 'lgps').reduce((sum, j) => sum + j.gross, 0);
  }, [paye]);

  const retirementSummary = useMemo(() => {
    let totalAnnualGross = 0;
    let totalAnnualTaxable = 0;

    projectedSavings.forEach((bucket) => {
      if (bucket.isHidden) return;
      const settings = drawdownSettings[bucket.id] || { rate: 4, lumpSumTaken: false, useStopAge: false, useWithdrawAge: false, stopAge: 60, withdrawAge: 60 };
      
      let annualIncome = 0;
      let taxableIncome = 0;

      if (['nhs-pension', 'civil-service-pension', 'teachers-pension', 'police-pension', 'firefighters-pension', 'armed-forces-pension', 'lgps-pension'].includes(bucket.type)) {
        const effectiveWithdrawAge = settings.useWithdrawAge ? settings.withdrawAge : (bucket.startWithdrawalAge || 67);
        if (isBucketAccessible({ type: bucket.type, startWithdrawalAge: effectiveWithdrawAge }, retirementAge)) {
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
              accrual = scheme === "classic" ? 80 : (scheme === "premium" || scheme === "nuvos") ? 60 : 43.1;
          } else if (bucket.type === 'teachers-pension') {
              salary = teachersJobsGross || bucket.dbSalary || 0;
              const scheme = bucket.dbScheme || "2015";
              accrual = (scheme === "classic" || scheme === "80th") ? 80 : scheme === "60th" ? 60 : 57;
          } else if (bucket.type === 'police-pension') {
              salary = policeJobsGross || bucket.dbSalary || 0;
              accrual = 55.3;
          } else if (bucket.type === 'firefighters-pension') {
              salary = firefightersJobsGross || bucket.dbSalary || 0;
              accrual = 59.7;
          } else if (bucket.type === 'armed-forces-pension') {
              salary = armedForcesJobsGross || bucket.dbSalary || 0;
              accrual = 47;
          } else if (bucket.type === 'lgps-pension') {
              salary = lgpsJobsGross || bucket.dbSalary || 0;
              accrual = 49;
          }

          annualIncome = (salary / accrual) * yearsAtRetirement;
          taxableIncome = annualIncome;
        }
      } else {
        let val = bucket.projected;
        
        // 1. Calculate the 25% penalty if it's an early LISA withdrawal
        if (bucket.type === 'lisa' && retirementAge < 60) {
          if (showLisaUnder60) {
            val = val * 0.75;
          } else {
            val = 0;
          }
        }

        // 2. Calculate income if accessible
        if (val > 0 && isBucketAccessible(bucket, retirementAge)) {
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
      }

      totalAnnualGross += annualIncome;
      totalAnnualTaxable += taxableIncome;
    });

    otherRetirementIncome.forEach(item => {
      // Only include income if retirement age is >= startAge (if specified)
      const startAge = item.startAge || 0;
      if (retirementAge >= startAge) {
        totalAnnualGross += item.amount * 12;
        if (item.isTaxable) {
          totalAnnualTaxable += item.amount * 12;
        }
      }
    });

    const taxResult = calculateIncomeTax(totalAnnualTaxable, taxSettings.taxCode, 0, taxSettings.region);
    const totalAnnualNet = totalAnnualGross - taxResult.totalTax;
    
    // Detailed Retirement Cost Calculation
    const mortgagePaidOffByRetirement = mortgageSummaries.every(ms => ms.payoffYears <= projectionYears);

    const retiredBudgetLinesTotal = budgetLines
        .filter(l => {
          const include = l.includeInRetirement ?? true;
          if (!include) return false;
          
          // Exclude savings lines from retirement expenses
          if (l.bucket === 'saving') return false;
          
          // Auto-exclude mortgage from retirement if it will be paid off
          if (mortgagePaidOffByRetirement && l.label.toLowerCase().includes('mortgage')) {
            return false;
          }
          return true;
        })
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
  }, [projectedSavings, retirementAge, otherRetirementIncome, expectedOutgoings, drawdownSettings, pensionAccessAge, nhsJobsGross, civilServiceJobsGross, teachersJobsGross, projectionYears, taxSettings, isBucketAccessible, budget.monthlyExpenses, inflationRate, budgetLines, annualBills, additionalRetirementExpenses, showLisaUnder60, mortgageSummaries]);

  const currentAccessibleWealth = savings.filter(s => isBucketAccessible(s, currentAge)).reduce((sum, s) => sum + s.balance, 0);
  const currentLockedWealth = savings.filter(s => !isBucketAccessible(s, currentAge)).reduce((sum, s) => sum + s.balance, 0);
  
  const annualContributionsAtAge = useMemo<AnnualContributionSchedule>(() => {
    return (age: number) => savings.reduce((totals, bucket) => {
      if (bucket.isHidden) return totals;

      const monthly = Math.max(0, clampNumber(bucket.monthly));
      if (monthly <= 0) return totals;

      if (bucket.stopContributingAge && age >= bucket.stopContributingAge) return totals;
      if (bucket.type === "lisa" && age >= 50) return totals;

      const annual = monthly * 12;
      const contribution = bucket.type === "lisa" ? annual * 1.25 : annual;

      if (isBucketAccessible(bucket, age)) {
        totals.accessible += contribution;
      } else {
        totals.locked += contribution;
      }

      return totals;
    }, { accessible: 0, locked: 0 });
  }, [savings]);

  const annualUserContributionsAtAge = useMemo<AnnualContributionSchedule>(() => {
    return (age: number) => savings.reduce((totals, bucket) => {
      if (bucket.isHidden) return totals;

      const monthly = Math.max(0, clampNumber(bucket.monthly));
      if (monthly <= 0) return totals;

      if (bucket.stopContributingAge && age >= bucket.stopContributingAge) return totals;
      if (bucket.type === "lisa" && age >= 50) return totals;

      const annual = monthly * 12;

      if (isBucketAccessible(bucket, age)) {
        totals.accessible += annual;
      } else {
        totals.locked += annual;
      }

      return totals;
    }, { accessible: 0, locked: 0 });
  }, [savings]);

  const currentAnnualContributions = annualUserContributionsAtAge(currentAge);
  const annualAccessibleContribution = currentAnnualContributions.accessible;
  const annualLockedContribution = currentAnnualContributions.locked;

const coastFireResult = useMemo(() => calculateCoastFire(
    currentAge,
    retirementAge,
    pensionAccessAge,
    currentAccessibleWealth,
    currentLockedWealth,
    budget.monthlyExpenses * 12,
    realGrowth,
    swr,
    annualAccessibleContribution,
    annualLockedContribution,
    firePassiveIncome,
    taxSettings.taxCode,
    taxSettings.region,
    pensionTaxMethod,
    annualContributionsAtAge,
    includeStatePension,
    STATE_PENSION_AGE,
    annualStatePension
  ), [
    currentAge, 
    retirementAge, 
    pensionAccessAge, 
    currentAccessibleWealth, 
    currentLockedWealth, 
    budget.monthlyExpenses,
    annualAccessibleContribution, 
    annualLockedContribution, 
    annualContributionsAtAge, 
    realGrowth, 
    swr, 
    firePassiveIncome,
    taxSettings,
    pensionTaxMethod,
    includeStatePension,
    STATE_PENSION_AGE,
    annualStatePension
  ]);

  
  const sections: { id: SectionId; title: string; value: string; detail: string; color: string; subValue?: string; subLabel?: string }[] = [
    { id: "overview", title: "Overview", value: monthlyMoney.format(overviewBudget.monthlySurplus), detail: "monthly surplus", color: "linear-gradient(135deg, #f0f7ff 0%, #ddebfa 100%)" },
    { id: "income", title: "Income", value: money.format(tax.payeGross + tax.selfProfit), detail: "gross + profit", color: "linear-gradient(135deg, #f0fff4 0%, #e0f9e8 100%)" },
    { id: "budget", title: "Budget", value: monthlyMoney.format(overviewBudget.monthlyOut), detail: "monthly outflow", color: "linear-gradient(135deg, #fffaf0 0%, #f8ecd4 100%)" },
    { 
      id: "savings", 
      title: "Savings", 
      value: money.format(projectedTotal), 
      subValue: "accessible",
      detail: money.format(accessibleProjectedTotal),
      color: "linear-gradient(135deg, #fffcf3 0%, #95cb99 100%)"
    },
    ...(showMortgageCard ? mortgages.map((m, i) => ({ 
      id: "mortgage" as SectionId, 
      title: `Mortgage ${i + 1}`, 
      value: money.format(m.amount), 
      subValue: `${mortgageSummaries[i].payoffYears.toFixed(1)} yrs payoff`,
      detail: "current balance",
      color: "linear-gradient(135deg, #fff5f5 0%, #f7d9d9 100%)" 
    })) : []),
    { id: "retirement" as SectionId, title: "Retirement", value: monthlyMoney.format(retirementSummary.monthlyIn), detail: `${projectionYears.toFixed(2)} year projection`, color: "linear-gradient(135deg, #f3e8ff 0%, #e8dded 100%)"},
    ...(showCoastFireCard ? [{ 
      id: "coastfire" as SectionId, 
      title: "Coast FIRE", 
      value: coastFireResult.isCoastFire 
        ? "REACHED" 
        : (coastFireResult.coastFireAge === -1 
          ? "NOT REACHED" 
          : (targetCoastAge 
            ? (coastFireResult.coastFireAge <= targetCoastAge ? "ON TRACK" : "BEHIND TARGET")
            : `Age ${Math.floor(coastFireResult.coastFireAge)}`
          )
        ), 
      detail: coastFireResult.isCoastFire 
        ? "contributions optional" 
        : (coastFireResult.coastFireAge === -1
          ? "not achievable"
          : (targetCoastAge 
            ? `Est: Age ${Math.floor(coastFireResult.coastFireAge)} (Target: ${targetCoastAge})` 
            : "estimated coast age"
          )
        ),
      color: coastFireResult.isCoastFire 
        ? "linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)" 
        : (coastFireResult.coastFireAge === -1 
          ? "linear-gradient(135deg, #fff5f5 0%, #ffe3e3 100%)" 
          : (targetCoastAge 
            ? (coastFireResult.coastFireAge <= targetCoastAge 
              ? "linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)" 
              : "linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)"
            )
            : "linear-gradient(135deg, #fffcf3 0%, #fdf9e2 100%)"
          )
        )
    }] : []),
    ...(showAssetsCard ? [{ 
      id: "assets" as SectionId, 
      title: "Assets", 
      value: money.format(assets.reduce((sum, a) => sum + a.value, 0)), 
      detail: "non-mortgaged assets", 
      color: "linear-gradient(135deg, #f0f7ff 0%, #ddebfa 100%)" 
    }] : []),
  ];

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

      {(pendingContributions.length > 0 || pendingMortgageUpdate) && (
        <div className="catchup-banner" style={{ background: '#fff9db', border: '1px solid #fcc419', padding: '12px', margin: '16px 20px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '0.9rem', color: '#856404' }}>
            <strong>Wealth Tracker:</strong> 
            {pendingContributions.length > 0 && ` You have ${pendingContributions.reduce((sum, p) => sum + p.count, 0)} pending monthly contributions to confirm.`}
            {pendingMortgageUpdate && ` Your mortgage has ${pendingMortgageUpdate.months} pending payments to apply.`}
          </div>
          <button onClick={confirmContributions} style={{ background: '#fcc419', color: '#856404', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: 600 }}>
            Confirm & Apply Capital
          </button>
        </div>
      )}

      <section className={`summary-grid ${activeSection !== "overview" ? "focus-mode" : ""}`}>
        <Metric label="Annual net estimate" value={money.format(tax.netAnnual)} tone="gold" />
        <Metric label="Monthly net estimate" value={monthlyMoney.format(tax.monthlyNet)} tone="gold" />
        <Metric label="Monthly expenses" value={monthlyMoney.format(budget.monthlyExpenses)} tone="gold red" />
        <Metric label="Monthly savings" value={monthlyMoney.format(budget.monthlySavings)} tone="gold green" />
      </section>

      <nav className={`section-cards ${activeSection !== "overview" ? "focus-mode" : ""}`} aria-label="Finance sections">
        {sections.map((section) => (
            <button
              className={activeSection === section.id ? "section-card active" : "section-card"}
              key={section.id}
              data-id={section.id}
              onClick={() => setActiveSection(section.id as SectionId)}
              style={{ background: section.color, borderColor: activeSection === section.id ? '#24594f' : undefined }}
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
          onLoadDemo={loadDemoScenario}
          showMortgageCard={showMortgageCard}
          setShowMortgageCard={setShowMortgageCard}
          showAssetsCard={showAssetsCard}
          setShowAssetsCard={setShowAssetsCard}
          showCoastFireCard={showCoastFireCard}
          setShowCoastFireCard={setShowCoastFireCard}
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
         budgetLines={budgetLines}
         excludedBudgetLines={excludedBudgetLines}
         setExcludedBudgetLines={setExcludedBudgetLines}
         savings={savingsForBudget}
         excludedSavings={excludedSavings}
         setExcludedSavings={setExcludedSavings}
         mortgages={mortgages}
       />
      ) : null}
      {activeSection === "income" ? (
        <IncomeSection
          paye={paye} setPaye={setPaye}
          selfEmployment={selfEmployment} setSelfEmployment={setSelfEmployment}
          savings={savings} setSavings={setSavings}
          taxSettings={taxSettings}
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
          mortgageOverpayment={mortgages[0]?.monthlyOverpayment ?? 0}
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
            birthYear={birthYear}
            mortgages={mortgages}
            assets={assets}
            currentAge={currentAge}
          />
            ) : null}

      {activeSection === "assets" ? (
        <AssetsSection assets={assets} setAssets={setAssets} />
      ) : null}

      {activeSection === "mortgage" ? (
        <MortgageSection mortgages={mortgages} setMortgages={setMortgages} mortgageSummaries={mortgageSummaries} />
      ) : null}

      {activeSection === "coastfire" ? (
        <CoastFireSection 
          currentAge={currentAge} 
          retirementAge={retirementAge}
          targetCoastAge={targetCoastAge}
          pensionAccessAge={pensionAccessAge}
          currentAccessibleBalance={currentAccessibleWealth}
          currentLockedBalance={currentLockedWealth}
          retirementExpenses={retirementSummary.currentMonthlyExpenses * 12}
          currentExpenses={budget.monthlyExpenses * 12}
          annualAccessibleContribution={annualAccessibleContribution}
          annualLockedContribution={annualLockedContribution}
          taxSettings={taxSettings}
          passiveIncome={firePassiveIncome}
          setPassiveIncome={setFirePassiveIncome}
          savings={savings}
          pensionTaxMethod={pensionTaxMethod}
          setPensionTaxMethod={setPensionTaxMethod}
          volatility={volatility}
          setVolatility={setVolatility}
          annualContributionsAtAge={annualContributionsAtAge}
          includeStatePension={includeStatePension}
          statePensionAge={STATE_PENSION_AGE}
          annualStatePension={annualStatePension}
        />
      ) : null}

      {activeSection === "retirement" ? (
        <RetirementSection
          retirementAge={retirementAge}
          setRetirementAge={(targetAge: number) => setProjectionYears(targetAge - currentAge)}
          targetCoastAge={targetCoastAge}
          setTargetCoastAge={setTargetCoastAge}
          outgoings={expectedOutgoings} setOutgoings={setExpectedOutgoings}
          budgetExpenses={budget.monthlyExpenses}
          monthlySurplus={budget.monthlySurplus}
          otherIncome={otherRetirementIncome} setOtherIncome={setOtherRetirementIncome}          summary={retirementSummary}
          projectedSavings={projectedSavings}
          drawdownSettings={drawdownSettings}
          setDrawdownSettings={setDrawdownSettings}
          isBucketAccessible={(type: string, age: number, startWithdrawalAge?: number) => isBucketAccessible({ type, startWithdrawalAge }, age)}
          nhsJobsGross={nhsJobsGross}
          civilServiceJobsGross={civilServiceJobsGross}
          teachersJobsGross={teachersJobsGross}
          policeJobsGross={policeJobsGross}
          firefightersJobsGross={firefightersJobsGross}
          armedForcesJobsGross={armedForcesJobsGross}
          lgpsJobsGross={lgpsJobsGross}
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
          mortgage={mortgages[0]}
          mortgageSummary={mortgageSummaries[0]}
          birthYear={birthYear}
          setBirthYear={setBirthYear}
          birthMonth={birthMonth}
          setBirthMonth={setBirthMonth}
          showLisaUnder60={showLisaUnder60}
          setShowLisaUnder60={setShowLisaUnder60}
          includeStatePension={includeStatePension}
          setIncludeStatePension={setIncludeStatePension}
          statePensionAge={STATE_PENSION_AGE}
          annualStatePension={annualStatePension}
          setAnnualStatePension={setAnnualStatePension}
          />      ) : null}

    </main>
  );
}

function CoastFireSection({ 
  currentAge, 
  retirementAge, 
  targetCoastAge,
  pensionAccessAge, 
  currentAccessibleBalance, 
  currentLockedBalance, 
  retirementExpenses, 
  currentExpenses, 
  annualAccessibleContribution, 
  annualLockedContribution,
  taxSettings,
  passiveIncome,
  setPassiveIncome,
  savings,
  pensionTaxMethod,
  setPensionTaxMethod,
  volatility,
  setVolatility,
  annualContributionsAtAge,
  includeStatePension,
  statePensionAge,
  annualStatePension
}: any) {
  const [showGrowthTable, setShowGrowthTable] = useState(false);
  const [swr, setSwr] = useState(4);
  const [realGrowth, setRealGrowth] = useState(3);
  const [targetType, setTargetType] = useState<"current" | "retirement">("current");
  const [simulatorMode, setSimulatorMode] = useState<"standard" | "excel">("standard");

  const annualExpenses = targetType === "current" ? currentExpenses : retirementExpenses;
  const netExpenses = Math.max(0, annualExpenses - passiveIncome);
  const annualContribution = annualAccessibleContribution + annualLockedContribution;

  const [excelIsaGrowth, setExcelIsaGrowth] = useState(7.0);
  const [excelPpGrowth, setExcelPpGrowth] = useState(3.0);
  const [excelIsaAddition, setExcelIsaAddition] = useState(annualAccessibleContribution || 16000);
  const [excelPpAddition, setExcelPpAddition] = useState(annualLockedContribution || 27450);
  const [excelNetIncomeRequired, setExcelNetIncomeRequired] = useState(Math.round(netExpenses) || 20307);
  const [excelIncomeInflation, setExcelIncomeInflation] = useState(2.8);
  const [excelStatePensionStart, setExcelStatePensionStart] = useState(12547);
  const [excelStatePensionTaxFactor, setExcelStatePensionTaxFactor] = useState(0.8);
  const [excelStatePensionInflation, setExcelStatePensionInflation] = useState(2.8);
  const [excelPpTaxFactor, setExcelPpTaxFactor] = useState(0.85);
  const [excelCoastAge, setExcelCoastAge] = useState(targetCoastAge || 50);
  const [excelRetirementAge, setExcelRetirementAge] = useState(retirementAge || 58);
  const [excelEndAge, setExcelEndAge] = useState(90);

  useEffect(() => {
    if (targetCoastAge) {
      setExcelCoastAge(targetCoastAge);
    }
  }, [targetCoastAge]);

  const syncWithProfile = () => {
    setExcelIsaAddition(annualAccessibleContribution);
    setExcelPpAddition(annualLockedContribution);
    setExcelNetIncomeRequired(Math.round(netExpenses));
    setExcelRetirementAge(retirementAge || 58);
    setExcelCoastAge(targetCoastAge || 50);
  };

  const updatedResult = useMemo(() => calculateCoastFire(
    currentAge,
    retirementAge,
    pensionAccessAge,
    currentAccessibleBalance,
    currentLockedBalance,
    annualExpenses,
    realGrowth,
    swr,
    annualAccessibleContribution,
    annualLockedContribution,
    passiveIncome,
    taxSettings.taxCode,
    taxSettings.region,
    pensionTaxMethod,
    annualContributionsAtAge,
    includeStatePension,
    statePensionAge,
    annualStatePension
  ), [currentAge, retirementAge, pensionAccessAge, currentAccessibleBalance, currentLockedBalance, annualExpenses, realGrowth, swr, annualAccessibleContribution, annualLockedContribution, passiveIncome, taxSettings, pensionTaxMethod, annualContributionsAtAge, includeStatePension, statePensionAge, annualStatePension]);

  const excelPlanTable = useMemo(() => {
    return generateExcelPlanTable(
      currentAge,
      excelCoastAge,
      excelRetirementAge,
      excelEndAge,
      currentAccessibleBalance,
      currentLockedBalance,
      excelNetIncomeRequired,
      excelIncomeInflation,
      excelIsaGrowth,
      excelPpGrowth,
      excelIsaAddition,
      excelPpAddition,
      excelStatePensionStart,
      excelStatePensionTaxFactor,
      excelStatePensionInflation,
      excelPpTaxFactor
    );
  }, [
    currentAge,
    excelCoastAge,
    excelRetirementAge,
    excelEndAge,
    currentAccessibleBalance,
    currentLockedBalance,
    excelNetIncomeRequired,
    excelIncomeInflation,
    excelIsaGrowth,
    excelPpGrowth,
    excelIsaAddition,
    excelPpAddition,
    excelStatePensionStart,
    excelStatePensionTaxFactor,
    excelStatePensionInflation,
    excelPpTaxFactor
  ]);

  const fullFireResult = useMemo(() => calculateFullFire(
    currentAge,
    pensionAccessAge,
    currentAccessibleBalance,
    currentLockedBalance,
    annualExpenses,
    realGrowth,
    swr,
    annualAccessibleContribution,
    annualLockedContribution,
    passiveIncome,
    taxSettings.taxCode,
    taxSettings.region,
    annualContributionsAtAge,
    includeStatePension,
    statePensionAge,
    annualStatePension
  ), [currentAge, pensionAccessAge, currentAccessibleBalance, currentLockedBalance, annualExpenses, realGrowth, swr, annualAccessibleContribution, annualLockedContribution, passiveIncome, taxSettings, annualContributionsAtAge, includeStatePension, statePensionAge, annualStatePension]);

  const grossSalaryRequired = useMemo(() => requiredGrossForNet(
    netExpenses / 12,
    taxSettings.taxCode,
    taxSettings.region,
    taxSettings.includeStudentLoan,
    taxSettings.pensionRate
  ), [netExpenses, taxSettings]);

  const currentTotalWealth = currentAccessibleBalance + currentLockedBalance;
  
  const coastProgressPercent = updatedResult.requiredCurrentBalance > 0
    ? Math.min(100, Math.max(0, (currentTotalWealth / updatedResult.requiredCurrentBalance) * 100))
    : 0;

  const targetPotAtCurrentAge = calculatePVBridge(netExpenses, realGrowth, Math.max(0, pensionAccessAge - currentAge)) + (netExpenses / (swr / 100)) / Math.pow(1 + realGrowth / 100, Math.max(0, pensionAccessAge - currentAge));
  const fullProgressPercent = targetPotAtCurrentAge > 0
    ? Math.min(100, Math.max(0, (currentTotalWealth / targetPotAtCurrentAge) * 100))
    : 0;

  const tableEndAge = retirementAge > 0 ? Math.max(retirementAge + 20, Math.min(pensionAccessAge + 15, 90)) : Math.min(currentAge + 40, 90);
  const coastStopAge = updatedResult.coastFireAge > 0 ? updatedResult.coastFireAge : currentAge; 
  const potGrowthTable = useMemo(() => generatePotGrowthTable(
    savings || [],
    currentAge,
    tableEndAge,
    realGrowth,
    pensionAccessAge,
    coastStopAge,
    annualAccessibleContribution,
    annualLockedContribution,
    retirementAge,
    annualExpenses,
    passiveIncome,
    taxSettings.taxCode,
    taxSettings.region,
    pensionTaxMethod
  ), [savings, currentAge, tableEndAge, realGrowth, pensionAccessAge, coastStopAge, annualAccessibleContribution, annualLockedContribution, retirementAge, annualExpenses, passiveIncome, taxSettings, pensionTaxMethod]);

  const retirementRow = useMemo(() => potGrowthTable.find(r => r.age === Math.floor(retirementAge)), [potGrowthTable, retirementAge]);
  const cashAtRetire = retirementRow ? retirementRow.cash : 0;
  const isaAtRetire = retirementRow ? retirementRow.isa : 0;
  const giaAtRetire = retirementRow ? retirementRow.gia : 0;
  const pensionAtRetire = retirementRow ? retirementRow.pension : 0;

  const monteCarloResult = useMemo(() => {
    return runMonteCarloSimulation(
      cashAtRetire,
      isaAtRetire,
      giaAtRetire,
      pensionAtRetire,
      retirementAge,
      tableEndAge,
      pensionAccessAge,
      annualExpenses,
      passiveIncome,
      realGrowth,
      volatility,
      taxSettings.taxCode,
      taxSettings.region,
      pensionTaxMethod,
      1000,
      includeStatePension,
      statePensionAge,
      annualStatePension
    );
  }, [cashAtRetire, isaAtRetire, giaAtRetire, pensionAtRetire, retirementAge, tableEndAge, pensionAccessAge, annualExpenses, passiveIncome, realGrowth, volatility, taxSettings, pensionTaxMethod, includeStatePension, statePensionAge, annualStatePension]);

  const fireAgeRow = fullFireResult.fullFireAge > 0
    ? potGrowthTable.find(r => r.age === Math.floor(fullFireResult.fullFireAge))
    : null;
  const accessibleAtFireAge = fireAgeRow ? fireAgeRow.accessible : 0;
  const annualWithdrawalFromAccessible = accessibleAtFireAge * (swr / 100);

  const isExcelSuccess = !excelPlanTable.some(row => row.source === "Shortfall");
  const finalPotExcel = excelPlanTable[excelPlanTable.length - 1]?.totalPot || 0;
  const depletionRow = excelPlanTable.find(row => row.source === "Shortfall");
  const depletionAge = depletionRow ? depletionRow.age : null;
  const ppWithdrawalRow = excelPlanTable.find(row => row.phase === "FI" && (row.source === "PP" || row.source === "ISA+PP"));
  const crossoverAge = ppWithdrawalRow ? ppWithdrawalRow.age : null;

  return (
    <div className="workspace">
      <section className="panel span-12">
        <div className="split-title" style={{ flexWrap: 'wrap', gap: '15px', marginBottom: '25px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: '1.5rem', color: '#1e293b' }}>FIRE Explorer</h2>
            <div className="button-group" style={{ background: '#f1f5f9', padding: '4px', borderRadius: '8px', display: 'inline-flex' }}>
              <button 
                className={simulatorMode === 'standard' ? 'active' : 'secondary'} 
                style={{ fontSize: '0.75rem', minHeight: '30px', padding: '0 12px', border: 'none', cursor: 'pointer', borderRadius: '6px' }}
                onClick={() => setSimulatorMode('standard')}
              >
                Standard Coast FIRE
              </button>
              <button 
                className={simulatorMode === 'excel' ? 'active' : 'secondary'} 
                style={{ fontSize: '0.75rem', minHeight: '30px', padding: '0 12px', border: 'none', cursor: 'pointer', borderRadius: '6px' }}
                onClick={() => setSimulatorMode('excel')}
              >
                Plan Calculator
              </button>
            </div>
          </div>

          {simulatorMode === 'standard' ? (
            <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', alignItems: 'center' }}>
              <div className="button-group" style={{ background: '#f1f5f9', padding: '4px', borderRadius: '8px', display: 'inline-flex' }}>
                <button 
                  className={targetType === 'current' ? 'active' : 'secondary'} 
                  style={{ fontSize: '0.75rem', minHeight: '30px', padding: '0 12px', border: 'none', cursor: 'pointer', borderRadius: '6px' }}
                  onClick={() => setTargetType('current')}
                >
                  Current Lifestyle ({money.format(currentExpenses)}/yr)
                </button>
                <button 
                  className={targetType === 'retirement' ? 'active' : 'secondary'} 
                  style={{ fontSize: '0.75rem', minHeight: '30px', padding: '0 12px', border: 'none', cursor: 'pointer', borderRadius: '6px' }}
                  onClick={() => setTargetType('retirement')}
                >
                  Retirement Budget ({money.format(retirementExpenses)}/yr)
                </button>
              </div>
              <div style={{ display: "flex", gap: "20px", flexWrap: 'wrap', alignItems: 'center' }}>
                <label style={{ fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '4px', fontWeight: 600, color: '#475569' }}>
                  Annual Passive Income
                  <NumberInput value={passiveIncome} onChange={setPassiveIncome} suffix="/yr" />
                </label>
                <label style={{ fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '4px', fontWeight: 600, color: '#475569' }}>
                  Real Growth Rate %
                  <NumberInput value={realGrowth} onChange={setRealGrowth} suffix="%" />
                </label>
                <label style={{ fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '4px', fontWeight: 600, color: '#475569' }}>
                  Safe Withdrawal Rate (SWR) %
                  <NumberInput value={swr} onChange={setSwr} suffix="%" />
                </label>
                <label style={{ fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '4px', fontWeight: 600, color: '#475569' }}>
                  Pension Tax Method
                  <select 
                    value={pensionTaxMethod} 
                    onChange={(e) => setPensionTaxMethod(e.target.value as 'ufpls' | 'lump-sum')}
                    style={{ 
                      padding: '8px 12px', 
                      borderRadius: '6px', 
                      border: '1px solid #cbd5e1', 
                      background: 'white', 
                      fontSize: '0.8rem',
                      fontWeight: 500,
                      color: '#334155',
                      height: '38px',
                      boxSizing: 'border-box'
                    }}
                  >
                    <option value="ufpls">UFPLS (25% tax-free / 75% taxed per withdrawal)</option>
                    <option value="lump-sum">25% tax-free Lump Sum upfront</option>
                  </select>
                </label>
              </div>
            </div>
          ) : (
            <div style={{ fontSize: '0.9rem', color: '#64748b', fontStyle: 'italic' }}>
              Timeline inputs are configured below.
            </div>
          )}
        </div>

        {simulatorMode === 'standard' ? (
          <>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', 
              gap: '24px', 
              marginBottom: '25px' 
            }}>
              <div style={{ 
                background: updatedResult.isCoastFire ? 'linear-gradient(135deg, #f0fff4 0%, #e0f9e8 100%)' : 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
                padding: '24px',
                borderRadius: '12px',
                border: updatedResult.isCoastFire ? '1px solid #86efac' : '1px solid #fde047',
                boxShadow: '0 4px 15px rgba(0,0,0,0.05)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between'
              }}>
                <div>
                  <span style={{ fontSize: '0.8rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 700 }}>
                    {updatedResult.isCoastFire ? "Coast Status: Reached" : (updatedResult.coastFireAge === -1 ? "Coast Status: Not Achievable" : "Estimated Coast FIRE Age")}
                  </span>
                  <h3 style={{ fontSize: '2.5rem', margin: '8px 0', color: updatedResult.isCoastFire ? '#166534' : '#92400e', fontWeight: 800 }}>
                    {updatedResult.isCoastFire ? "REACHED!" : (updatedResult.coastFireAge === -1 ? "NOT REACHED" : `Age ${Math.floor(updatedResult.coastFireAge)}`)}
                  </h3>
                  
                  <div style={{ margin: '15px 0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#475569', marginBottom: '4px', fontWeight: 600 }}>
                      <span>Coast Progress (Today)</span>
                      <span>{coastProgressPercent.toFixed(0)}%</span>
                    </div>
                    <div style={{ width: '100%', height: '8px', background: 'rgba(0,0,0,0.06)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ width: `${coastProgressPercent}%`, height: '100%', background: updatedResult.isCoastFire ? '#22c55e' : '#eab308', borderRadius: '4px', transition: 'width 0.5s ease-out' }}></div>
                    </div>
                  </div>

                  <p style={{ fontSize: '0.95rem', color: '#334155', lineHeight: '1.5', margin: '15px 0' }}>
                    {updatedResult.isCoastFire 
                      ? `Your current savings of ${money.format(currentTotalWealth)} are large enough to fund your retirement through growth alone. You could stop contributing today!`
                      : (updatedResult.coastFireAge === -1 
                        ? (fullFireResult.fullFireAge > 0
                          ? `You won't reach Coast FIRE before retirement age ${retirementAge.toFixed(0)}, but at ${money.format(annualContribution)}/yr your projected Full FIRE age is ${Math.floor(fullFireResult.fullFireAge)}.`
                          : `Even if you keep contributing ${money.format(annualContribution)}/yr, you won't reach Coast FIRE by retirement age ${retirementAge.toFixed(0)}.`)
                        : `If you keep contributing ${money.format(annualContribution)}/yr, you will reach Coast FIRE at age ${Math.floor(updatedResult.coastFireAge)}. From that point, you don't need to save another penny for retirement.`)}
                  </p>

                  {targetCoastAge > 0 && (
                    <div style={{ 
                      marginTop: '15px', 
                      padding: '12px 16px', 
                      borderRadius: '8px', 
                      background: 'rgba(255,255,255,0.6)', 
                      border: '1px solid rgba(0,0,0,0.05)',
                      fontSize: '0.9rem' 
                    }}>
                      <span style={{ fontWeight: 600, display: 'block', marginBottom: '4px', color: '#475569' }}>
                        Target Coast Age vs. Projection:
                      </span>
                      {updatedResult.isCoastFire ? (
                        <span style={{ color: '#166534', fontWeight: 600 }}>
                          ✓ Reached today (Age {currentAge.toFixed(1)}), ahead of target age {targetCoastAge}.
                        </span>
                      ) : updatedResult.coastFireAge === -1 ? (
                        <span style={{ color: '#991b1b', fontWeight: 600 }}>
                          ✗ Not achievable by target age {targetCoastAge}.
                        </span>
                      ) : updatedResult.coastFireAge <= targetCoastAge ? (
                        <span style={{ color: '#166534', fontWeight: 600 }}>
                          ✓ On track! You will reach Coast FIRE at age {Math.floor(updatedResult.coastFireAge)}, which is before your target age {targetCoastAge}.
                        </span>
                      ) : (
                        <span style={{ color: '#92400e', fontWeight: 600 }}>
                          ⚠ Behind target: Projected to reach Coast FIRE at age {Math.floor(updatedResult.coastFireAge)}, which is {Math.ceil(updatedResult.coastFireAge - targetCoastAge)} years after your target age {targetCoastAge}.
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div style={{ borderTop: '1px solid rgba(0,0,0,0.08)', paddingTop: '15px', marginTop: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', margin: '6px 0', fontSize: '0.9rem' }}>
                    <span style={{ color: '#475569' }}>Coast FIRE Number Today:</span>
                    <strong style={{ color: '#1e293b' }}>{money.format(updatedResult.requiredCurrentBalance)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', margin: '6px 0', fontSize: '0.9rem' }}>
                    <span style={{ color: '#475569' }}>Current Savings Pot:</span>
                    <strong style={{ color: '#1e293b' }}>{money.format(currentTotalWealth)}</strong>
                  </div>
                  {updatedResult.currentCoastGap > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', margin: '6px 0', fontSize: '0.9rem' }}>
                      <span style={{ color: '#991b1b' }}>Coast Gap Today:</span>
                      <strong style={{ color: '#b91c1c' }}>{money.format(updatedResult.currentCoastGap)}</strong>
                    </div>
                  )}
                  {updatedResult.coastFireAge !== -1 && !updatedResult.isCoastFire && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', margin: '6px 0', fontSize: '0.9rem' }}>
                      <span style={{ color: '#475569' }}>Target Pot at Coast Age:</span>
                      <strong style={{ color: '#1e293b' }}>{money.format(updatedResult.coastFirePotAtAge)}</strong>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', margin: '6px 0', fontSize: '0.9rem' }}>
                    <span style={{ color: '#475569' }}>Projected Pot at Retirement:</span>
                    <strong style={{ color: '#1e293b' }}>{money.format(updatedResult.projectedPotAtRetirement)}</strong>
                  </div>
                </div>
              </div>

              <div style={{ 
                background: fullFireResult.isFullFire ? 'linear-gradient(135deg, #ecfeff 0%, #cffafe 100%)' : 'linear-gradient(135deg, #f5f3ff 0%, #e0e7ff 100%)',
                padding: '24px',
                borderRadius: '12px',
                border: fullFireResult.isFullFire ? '1px solid #67e8f9' : '1px solid #c7d2fe',
                boxShadow: '0 4px 15px rgba(0,0,0,0.05)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between'
              }}>
                <div>
                  <span style={{ fontSize: '0.8rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 700 }}>
                    {fullFireResult.isFullFire ? "FIRE Status: Reached" : "Estimated Full FIRE Age"}
                  </span>
                  <h3 style={{ fontSize: '2.5rem', margin: '8px 0', color: fullFireResult.isFullFire ? '#0891b2' : '#4338ca', fontWeight: 800 }}>
                    {fullFireResult.isFullFire ? "REACHED!" : (fullFireResult.fullFireAge === -1 ? "NOT REACHED" : `Age ${Math.floor(fullFireResult.fullFireAge)}`)}
                  </h3>

                  <div style={{ margin: '15px 0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#475569', marginBottom: '4px', fontWeight: 600 }}>
                      <span>Full FIRE Progress (Today)</span>
                      <span>{fullProgressPercent.toFixed(0)}%</span>
                    </div>
                    <div style={{ width: '100%', height: '8px', background: 'rgba(0,0,0,0.06)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ width: `${fullProgressPercent}%`, height: '100%', background: fullFireResult.isFullFire ? '#06b6d4' : '#6366f1', borderRadius: '4px', transition: 'width 0.5s ease-out' }}></div>
                    </div>
                  </div>

                  <p style={{ fontSize: '0.95rem', color: '#334155', lineHeight: '1.5', margin: '15px 0' }}>
                    {fullFireResult.isFullFire 
                      ? `Congratulations! Your current assets of ${money.format(currentTotalWealth)} are already larger than your target FIRE pot of ${money.format(targetPotAtCurrentAge)} for your current age.`
                      : (fullFireResult.fullFireAge === -1
                        ? `Even if you keep saving ${money.format(annualContribution)}/yr, you won't reach Full FIRE by your pension access age ${pensionAccessAge}.`
                        : `If you keep saving ${money.format(annualContribution)}/yr, you can completely retire (Full FIRE) at age ${Math.floor(fullFireResult.fullFireAge)}.`)}
                  </p>
                </div>

                <div style={{ borderTop: '1px solid rgba(0,0,0,0.08)', paddingTop: '15px', marginTop: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', margin: '6px 0', fontSize: '0.9rem' }}>
                    <span style={{ color: '#475569' }}>Target Pot Today:</span>
                    <strong style={{ color: '#1e293b' }}>{money.format(targetPotAtCurrentAge)}</strong>
                  </div>
                  {fullFireResult.fullFireAge > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', margin: '6px 0', fontSize: '0.9rem' }}>
                      <span style={{ color: '#475569' }}>Target Pot at Full FIRE:</span>
                      <strong style={{ color: '#1e293b' }}>{money.format(fullFireResult.targetPotAtFullFireAge)}</strong>
                    </div>
                  )}
                  {fullFireResult.fullFireAge > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', margin: '6px 0', fontSize: '0.9rem' }}>
                      <span style={{ color: '#475569' }}>Projected Pot at Full FIRE:</span>
                      <strong style={{ color: '#1e293b' }}>{money.format(fullFireResult.fullFirePotAtAge)}</strong>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '25px' }}>
              <button 
                className="secondary" 
                style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 24px', minHeight: '38px', cursor: 'pointer' }}
                onClick={() => setShowGrowthTable(!showGrowthTable)}
              >
                {showGrowthTable ? 'Hide Simulated Timeline Table ▴' : 'Show Simulated Timeline Table ▾'}
              </button>
            </div>

            {showGrowthTable && (
              <div style={{ margin: '20px 0' }}>
                <div style={{ overflowX: 'auto', border: '1px solid #cbd5e1', borderRadius: '8px' }}>
                  <table className="savings-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc' }}>
                        {[
                          { label: 'Age', align: 'left' },
                          { label: 'Phase', align: 'left' },
                          { label: 'Cash (Savings)', align: 'right' },
                          { label: 'ISA / LISA', align: 'right' },
                          { label: 'GIA', align: 'right' },
                          { label: 'Pension (Locked)', align: 'right' },
                          { label: 'Total Pot', align: 'right' },
                          { label: 'Withdraw (Acc)', align: 'right' },
                          { label: 'Withdraw (Pension)', align: 'right' },
                        ].map(h => (
                          <th key={h.label} style={{ padding: '10px 12px', textAlign: h.align as any, fontWeight: 700, color: '#475569', fontSize: '0.73rem', textTransform: 'uppercase', letterSpacing: '0.4px', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>
                            {h.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {potGrowthTable.map((row, idx) => {
                        const isCoastAge  = updatedResult.coastFireAge > 0 && row.age === Math.floor(updatedResult.coastFireAge);
                        const isTargetCoastAge = targetCoastAge > 0 && row.age === Math.floor(targetCoastAge);
                        const isPensionUnlockAge = row.age === pensionAccessAge;
                        const isRetirementAge = row.age === Math.floor(retirementAge);
                        const isFireAge   = fullFireResult.fullFireAge > 0 && row.age === Math.floor(fullFireResult.fullFireAge);

                        const phaseBg = row.isShortfall ? '#fff1f2'
                          : row.phase === 'accumulation' ? (idx % 2 === 0 ? '#f0f9ff' : '#e0f2fe20')
                          : row.phase === 'coasting'     ? (idx % 2 === 0 ? '#fefce8' : '#fef9c380')
                          : /* drawdown */                 (idx % 2 === 0 ? '#fdf2f8' : '#fce7f350');

                        const phaseLabel = row.phase === 'accumulation' ? { label: 'Accumulating', color: '#0369a1', bg: '#e0f2fe' }
                          : row.phase === 'coasting' ? { label: 'Coasting', color: '#854d0e', bg: '#fef9c3' }
                          : { label: row.isShortfall ? 'Shortfall ⚠️' : 'Drawdown', color: row.isShortfall ? '#be123c' : '#be185d', bg: row.isShortfall ? '#fecdd3' : '#fce7f3' };

                        const fw = (isCoastAge || isTargetCoastAge || isRetirementAge || isPensionUnlockAge || isFireAge) ? 700 : 400;

                        return (
                          <tr key={row.age} style={{ background: phaseBg, borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                            <td style={{ padding: '8px 12px', fontWeight: fw, color: '#334155', whiteSpace: 'nowrap' }}>
                              {row.age}
                              {isCoastAge     && <span style={{ marginLeft: '5px', fontSize: '0.67rem', background: '#bbf7d0', color: '#166534', padding: '1px 5px', borderRadius: '4px', fontWeight: 700 }}>Coast FIRE</span>}
                              {isTargetCoastAge && !isCoastAge && <span style={{ marginLeft: '5px', fontSize: '0.67rem', background: '#bae6fd', color: '#0369a1', padding: '1px 5px', borderRadius: '4px', fontWeight: 700 }}>Target Coast</span>}
                              {isRetirementAge && !isCoastAge && !isTargetCoastAge && <span style={{ marginLeft: '5px', fontSize: '0.67rem', background: '#fde68a', color: '#854d0e', padding: '1px 5px', borderRadius: '4px', fontWeight: 700 }}>Retire</span>}
                              {isPensionUnlockAge && !isCoastAge && !isRetirementAge && !isTargetCoastAge && <span style={{ marginLeft: '5px', fontSize: '0.67rem', background: '#dbeafe', color: '#1e40af', padding: '1px 5px', borderRadius: '4px', fontWeight: 700 }}>Pension Unlocks</span>}
                              {isFireAge && !isCoastAge && !isRetirementAge && !isPensionUnlockAge && !isTargetCoastAge && <span style={{ marginLeft: '5px', fontSize: '0.67rem', background: '#e9d5ff', color: '#6b21a8', padding: '1px 5px', borderRadius: '4px', fontWeight: 700 }}>Full FIRE</span>}
                            </td>
                            <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                              <span style={{ fontSize: '0.72rem', background: phaseLabel.bg, color: phaseLabel.color, padding: '2px 7px', borderRadius: '4px', fontWeight: 600 }}>
                                {phaseLabel.label}
                              </span>
                            </td>
                            <td style={{ padding: '8px 12px', textAlign: 'right', color: '#334155', fontWeight: fw }}>
                              {row.cash > 1 ? money.format(row.cash) : <span style={{ color: '#cbd5e1' }}>—</span>}
                            </td>
                            <td style={{ padding: '8px 12px', textAlign: 'right', color: '#334155', fontWeight: fw }}>
                              {row.isa > 1 ? money.format(row.isa) : <span style={{ color: '#cbd5e1' }}>—</span>}
                            </td>
                            <td style={{ padding: '8px 12px', textAlign: 'right', color: '#334155', fontWeight: fw }}>
                              {row.gia > 1 ? money.format(row.gia) : <span style={{ color: '#cbd5e1' }}>—</span>}
                            </td>
                            <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: fw }}>
                              {row.pension > 1
                                ? <span style={{ color: row.age < pensionAccessAge ? '#94a3b8' : '#334155', fontStyle: row.age < pensionAccessAge ? 'italic' : 'normal' }}>
                                    {money.format(row.pension)}
                                    {row.age < pensionAccessAge && <span style={{ fontSize: '0.62rem', display: 'block', color: '#94a3b8' }}>locked</span>}
                                  </span>
                                : <span style={{ color: '#cbd5e1' }}>—</span>}
                            </td>
                            <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#1e293b' }}>
                              {money.format(row.total)}
                            </td>
                            <td style={{ padding: '8px 12px', textAlign: 'right', color: row.withdrawalAccessible > 0 ? '#be185d' : '#cbd5e1', fontWeight: row.withdrawalAccessible > 0 ? 600 : 400 }}>
                              {row.withdrawalAccessible > 0
                                ? <>
                                    <span style={{ display: 'block' }}>{money.format(row.withdrawalAccessible)}</span>
                                    <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>ISA / Cash</span>
                                  </>
                                : '—'}
                            </td>
                            <td style={{ padding: '8px 12px', textAlign: 'right', color: row.withdrawalPension > 0 ? '#7c3aed' : '#cbd5e1', fontWeight: row.withdrawalPension > 0 ? 600 : 400 }}>
                              {row.withdrawalPension > 0
                                ? <>
                                    <span style={{ display: 'block' }}>{money.format(row.withdrawalPension)}</span>
                                    <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>Pension</span>
                                  </>
                                : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '8px', textAlign: 'center' }}>
                  📌 Pension locked until age {pensionAccessAge}. Withdrawals split proportionally across pots. Required: {money.format(netExpenses)}/yr net · Shortfall rows highlighted in red.
                </p>
              </div>
            )}

            {retirementAge < pensionAccessAge && (
              <div style={{ 
                background: updatedResult.isBridgeFunded ? '#f0f9ff' : '#fff1f2', 
                padding: '15px 20px', 
                borderRadius: '8px', 
                marginBottom: '20px',
                border: `1px solid ${updatedResult.isBridgeFunded ? '#bae6fd' : '#fecdd3'}`,
                display: 'flex',
                alignItems: 'center',
                gap: '15px'
              }}>
                <span style={{ fontSize: '1.5rem' }}>{updatedResult.isBridgeFunded ? '✅' : '⚠️'}</span>
                <div style={{ flex: 1 }}>
                  <strong style={{ display: 'block', color: updatedResult.isBridgeFunded ? '#0369a1' : '#9f1239' }}>
                    Early Retirement Bridge: {money.format(updatedResult.bridgeRequired)} required in accessible accounts
                  </strong>
                  <small style={{ color: '#64748b' }}>
                    You want to retire at age {retirementAge.toFixed(0)}, but your pension pots are locked until age {pensionAccessAge}. 
                    {updatedResult.isBridgeFunded 
                      ? ` Your ISA/Cash pots (currently ${money.format(currentAccessibleBalance)}) are projected to grow to at least ${money.format(updatedResult.bridgeRequired)} by retirement age, which is sufficient to cover your expenses during the bridge years.`
                      : ` Your ISA/Cash pots (currently ${money.format(currentAccessibleBalance)}) are too small and are projected to fall short. To retire at ${retirementAge.toFixed(0)}, you will need to allocate more contributions to accessible accounts like ISAs or Cash.`}
                  </small>
                </div>
              </div>
            )}

            <div className="summary-grid">
              <Metric label="Long Term Target Pot" value={money.format(updatedResult.targetPotAtRetirement)} detail={`to cover net expenses of ${money.format(netExpenses)}/yr (passive deducted)`} />
              <Metric label="Total Annual Contributions" value={money.format(annualContribution)} detail={`Accessible: ${money.format(annualAccessibleContribution)}/yr, Locked: ${money.format(annualLockedContribution)}/yr`} />
              <Metric label="Net Expenses Covered" value={money.format(netExpenses)} detail={`Total target: ${money.format(annualExpenses)}/yr less passive: ${money.format(passiveIncome)}/yr`} />
              <Metric label="Equivalent Coasting Gross" value={money.format(grossSalaryRequired)} detail="Gross salary needed to cover net lifestyle shortage" />
            </div>

            <div style={{ marginTop: '30px', padding: '20px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <h3 style={{ marginTop: 0 }}>Smart Access &amp; Bridge Awareness</h3>
              <p style={{ fontSize: '0.9rem', color: '#64748b', lineHeight: '1.6' }}>
                This calculator is <strong>Access-Aware</strong>. Early retirement (before your Pension Access Age of {pensionAccessAge}) requires separating your wealth into two phases:
                <br/><br/>
                1. <strong>The Bridge Phase (Retirement Age to {pensionAccessAge}):</strong> Since pensions cannot be touched, you must live off accessible accounts (ISAs and Cash). We calculate the present value of this bridge, allowing your leftover accessible money to grow during this period.
                <br/>
                2. <strong>The Long-Term Phase ({pensionAccessAge} onwards):</strong> Once your pensions unlock, your combined total pots (Pensions + remaining Accessible pots) must be large enough to support you forever under a {swr}% safe withdrawal rate.
                <br/><br/>
                <strong>Your Coasting Income:</strong> Once you reach Coast FIRE (Age {updatedResult.coastFireAge === -1 ? "N/A" : Math.floor(updatedResult.coastFireAge)}), you no longer need to save for retirement. You only need to earn enough from work to cover your remaining net living expenses: <strong>{money.format(netExpenses)}/year net</strong> (equivalent to <strong>{money.format(grossSalaryRequired)}/year gross</strong>) in addition to your passive income of <strong>{money.format(passiveIncome)}/year</strong>.
              </p>
            </div>

            <div style={{ marginTop: '30px', padding: '24px', background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px', marginBottom: '20px' }}>
                <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  🎲 Retirement Monte Carlo Simulator
                </h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    Portfolio Volatility
                    <NumberInput value={volatility} onChange={setVolatility} suffix="%" />
                  </label>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginBottom: '24px' }}>
                <div style={{ 
                  background: monteCarloResult.successRate >= 90 ? '#f0fff4' : (monteCarloResult.successRate >= 80 ? '#fffbeb' : '#fff5f5'),
                  padding: '20px',
                  borderRadius: '8px',
                  border: `1px solid ${monteCarloResult.successRate >= 90 ? '#bbf7d0' : (monteCarloResult.successRate >= 80 ? '#fef3c7' : '#feb2b2')}`,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  alignItems: 'center',
                  textAlign: 'center'
                }}>
                  <span style={{ fontSize: '0.8rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700 }}>
                    Probability of Success
                  </span>
                  <h4 style={{ fontSize: '3rem', margin: '10px 0', color: monteCarloResult.successRate >= 90 ? '#166534' : (monteCarloResult.successRate >= 80 ? '#92400e' : '#9b1c1c'), fontWeight: 800 }}>
                    {monteCarloResult.successRate.toFixed(1)}%
                  </h4>
                  <p style={{ fontSize: '0.8rem', color: '#475569', margin: 0, fontWeight: 500 }}>
                    {monteCarloResult.successRate >= 90 
                      ? 'Highly secure! Your retirement strategy is highly resilient to market shocks.' 
                      : (monteCarloResult.successRate >= 80 
                          ? 'Plan is generally stable, but consider a small margin of safety.' 
                          : 'High risk of depletion. You may need higher contributions or lower expenses.')}
                  </p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <h4 style={{ margin: '0 0 10px 0', fontSize: '1rem', color: '#334155' }}>What does this success rate mean?</h4>
                  <p style={{ fontSize: '0.825rem', color: '#64748b', lineHeight: '1.5', margin: 0 }}>
                    Instead of assuming a static growth rate (e.g. constant {realGrowth}%), we simulate <strong>1,000 distinct retirements</strong> where the market return fluctuates randomly each year (averaging {realGrowth}% with a standard deviation of {volatility}% volatility).
                    <br/><br/>
                    A success rate of <strong>{monteCarloResult.successRate.toFixed(1)}%</strong> means that in <strong>{(monteCarloResult.successRate * 10).toFixed(0)} out of 1,000</strong> simulated trials, your pension and accessible savings survived until age {tableEndAge} without hitting zero.
                  </p>
                </div>
              </div>

              <div style={{ background: '#ffffff', padding: '20px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <h4 style={{ margin: '0 0 15px 0', fontSize: '0.95rem', color: '#334155', textAlign: 'center' }}>
                  Stochastic Pot Trajectories (Ages {Math.floor(retirementAge)} to {tableEndAge})
                </h4>
                <MonteCarloChart result={monteCarloResult} />
              </div>
            </div>
          </>
        ) : (
          <>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', 
              gap: '20px', 
              marginBottom: '25px', 
              padding: '20px', 
              background: '#f8fafc', 
              borderRadius: '8px', 
              border: '1px solid #e2e8f0' 
            }}>
              <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#1e293b' }}>Plan Calculator Parameters</h3>
                <button 
                  className="secondary" 
                  style={{ fontSize: '0.75rem', padding: '6px 12px', minHeight: '30px', cursor: 'pointer' }}
                  onClick={syncWithProfile}
                >
                  🔄 Sync with Profile
                </button>
              </div>
              
              <label style={{ fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '4px', fontWeight: 600, color: '#475569' }}>
                Net Income Required
                <NumberInput value={excelNetIncomeRequired} onChange={setExcelNetIncomeRequired} suffix="/yr" />
              </label>
              <label style={{ fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '4px', fontWeight: 600, color: '#475569' }}>
                Income Inflation Rate (%)
                <NumberInput value={excelIncomeInflation} onChange={setExcelIncomeInflation} suffix="%" />
              </label>
              <label style={{ fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '4px', fontWeight: 600, color: '#475569' }}>
                Coast Start Age
                <NumberInput value={excelCoastAge} onChange={setExcelCoastAge} max={excelRetirementAge} />
              </label>
              <label style={{ fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '4px', fontWeight: 600, color: '#475569' }}>
                Retirement Age (FI)
                <NumberInput value={excelRetirementAge} onChange={setExcelRetirementAge} max={excelEndAge} />
              </label>

              <label style={{ fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '4px', fontWeight: 600, color: '#475569' }}>
                ISA Growth Rate (%)
                <NumberInput value={excelIsaGrowth} onChange={setExcelIsaGrowth} suffix="%" />
              </label>
              <label style={{ fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '4px', fontWeight: 600, color: '#475569' }}>
                Yearly ISA Addition
                <NumberInput value={excelIsaAddition} onChange={setExcelIsaAddition} />
              </label>
              <label style={{ fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '4px', fontWeight: 600, color: '#475569' }}>
                PP Growth Rate (%)
                <NumberInput value={excelPpGrowth} onChange={setExcelPpGrowth} suffix="%" />
              </label>
              <label style={{ fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '4px', fontWeight: 600, color: '#475569' }}>
                Yearly PP Addition
                <NumberInput value={excelPpAddition} onChange={setExcelPpAddition} />
              </label>

              <label style={{ fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '4px', fontWeight: 600, color: '#475569' }}>
                PP Tax Factor
                <NumberInput value={excelPpTaxFactor} onChange={setExcelPpTaxFactor} suffix="(ex: 0.85)" />
              </label>
              <label style={{ fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '4px', fontWeight: 600, color: '#475569' }}>
                Base State Pension
                <NumberInput value={excelStatePensionStart} onChange={setExcelStatePensionStart} />
              </label>
              <label style={{ fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '4px', fontWeight: 600, color: '#475569' }}>
                State Pension Tax Factor
                <NumberInput value={excelStatePensionTaxFactor} onChange={setExcelStatePensionTaxFactor} suffix="(ex: 0.8)" />
              </label>
              <label style={{ fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '4px', fontWeight: 600, color: '#475569' }}>
                State Pension Inflation (%)
                <NumberInput value={excelStatePensionInflation} onChange={setExcelStatePensionInflation} suffix="%" />
              </label>
            </div>

            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', 
              gap: '24px', 
              marginBottom: '25px' 
            }}>
              <div style={{ 
                background: isExcelSuccess ? 'linear-gradient(135deg, #f0fff4 0%, #e0f9e8 100%)' : 'linear-gradient(135deg, #fff5f5 0%, #ffe3e3 100%)',
                padding: '24px',
                borderRadius: '12px',
                border: isExcelSuccess ? '1px solid #86efac' : '1px solid #feb2b2',
                boxShadow: '0 4px 15px rgba(0,0,0,0.05)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between'
              }}>
                <div>
                  <span style={{ fontSize: '0.8rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 700 }}>
                    Plan Sustainability Status
                  </span>
                  <h3 style={{ fontSize: '2.5rem', margin: '8px 0', color: isExcelSuccess ? '#166534' : '#9b2c2c', fontWeight: 800 }}>
                    {isExcelSuccess ? "SUCCESS!" : `DEPLETED AT AGE ${depletionAge}`}
                  </h3>
                  <p style={{ fontSize: '0.95rem', color: '#334155', lineHeight: '1.5', margin: '15px 0' }}>
                    {isExcelSuccess 
                      ? `Your custom plan is fully sustainable. At Age 90, your projected remaining pot value is ${money.format(finalPotExcel)}.`
                      : `Based on your parameters, your pots will run dry at Age ${depletionAge}. Adjust additions, growth rates, or retire later to ensure a lifetime of security.`}
                  </p>
                </div>
                <div style={{ borderTop: '1px solid rgba(0,0,0,0.08)', paddingTop: '15px', marginTop: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', margin: '6px 0', fontSize: '0.9rem' }}>
                    <span style={{ color: '#475569' }}>Final Pot at Age 90:</span>
                    <strong style={{ color: '#1e293b' }}>{money.format(finalPotExcel)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', margin: '6px 0', fontSize: '0.9rem' }}>
                    <span style={{ color: '#475569' }}>Phase years:</span>
<strong style={{ color: '#1e293b' }}>
  {Math.max(0, excelCoastAge - currentAge).toFixed(2)} building / {Math.max(0, excelRetirementAge - excelCoastAge).toFixed(2)} coasting
</strong>                  </div>
                </div>
              </div>

              <div style={{ 
                background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
                padding: '24px',
                borderRadius: '12px',
                border: '1px solid #cbd5e1',
                boxShadow: '0 4px 15px rgba(0,0,0,0.05)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between'
              }}>
                <div>
                  <span style={{ fontSize: '0.8rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 700 }}>
                    Funding Drawdown Strategy
                  </span>
                  <h3 style={{ fontSize: '1.5rem', margin: '12px 0 8px 0', color: '#0f172a', fontWeight: 800 }}>
                    ISA ➡️ Pension Crossover
                  </h3>
                  <p style={{ fontSize: '0.9rem', color: '#475569', lineHeight: '1.5' }}>
                    Drawdown starts at Age {excelRetirementAge}. Expenses are funded from tax-free ISA first.
                    {crossoverAge ? (
                      <span> Once ISA is depleted, funding crosses over to the Private Pension at <strong>Age {crossoverAge}</strong>.</span>
                    ) : (
                      <span> ISA is never fully depleted in the simulation; you do not transition to pension withdrawals before age 90.</span>
                    )}
                  </p>
                </div>
                <div style={{ borderTop: '1px solid rgba(0,0,0,0.08)', paddingTop: '15px', marginTop: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', margin: '6px 0', fontSize: '0.9rem' }}>
                    <span style={{ color: '#475569' }}>Initial ISA:</span>
                    <strong style={{ color: '#1e293b' }}>{money.format(currentAccessibleBalance)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', margin: '6px 0', fontSize: '0.9rem' }}>
                    <span style={{ color: '#475569' }}>Initial Pension:</span>
                    <strong style={{ color: '#1e293b' }}>{money.format(currentLockedBalance)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', margin: '6px 0', fontSize: '0.9rem' }}>
                    <span style={{ color: '#475569' }}>State Pension Starts (Age 68+):</span>
                    <strong style={{ color: '#1e293b' }}>{money.format(excelStatePensionStart * excelStatePensionTaxFactor)}/yr net</strong>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ margin: '30px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                <h3 style={{ margin: 0, color: '#1e293b' }}>Excel Plan Simulator Timeline</h3>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Ages {Math.ceil(currentAge)} to {excelEndAge}</span>
              </div>
              <div style={{ overflowX: 'auto', border: '1px solid #cbd5e1', borderRadius: '8px' }}>
                <table className="savings-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc' }}>
                      {[
                        { label: 'Age', align: 'left' },
                        { label: 'Phase', align: 'left' },
                        { label: 'Required Net Income', align: 'right' },
                        { label: 'Post-Tax State Pension', align: 'right' },
                        { label: 'Net Required from Pots', align: 'right' },
                        { label: 'Funding Source', align: 'left' },
                        { label: 'ISA Total', align: 'right' },
                        { label: 'ISA Change', align: 'right' },
                        { label: 'PP Total', align: 'right' },
                        { label: 'PP Change', align: 'right' },
                        { label: 'Total Pot', align: 'right' }
                      ].map(h => (
                        <th key={h.label} style={{ padding: '10px 12px', textAlign: h.align as any, fontWeight: 700, color: '#475569', fontSize: '0.73rem', textTransform: 'uppercase', letterSpacing: '0.4px', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>
                          {h.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {excelPlanTable.map((row, idx) => {
                      const rowBg = row.source === "Shortfall" ? "#fff1f2"
                        : row.phase === "Building" ? (idx % 2 === 0 ? "#f0f9ff" : "#e0f2fe20")
                        : row.phase === "Coasting" ? (idx % 2 === 0 ? "#fefce8" : "#fef9c380")
                        : /* FI */ (idx % 2 === 0 ? "#fdf2f8" : "#fce7f350");

                      const phaseBadge = row.phase === "Building" ? { label: "Building", bg: "#e0f2fe", color: "#0369a1" }
                        : row.phase === "Coasting" ? { label: "Coasting", bg: "#fef9c3", color: "#854d0e" }
                        : { label: "FI / Drawdown", bg: "#fce7f3", color: "#be185d" };

                      const sourceBadge = row.source === "Salary" ? { label: "Salary", bg: "#f1f5f9", color: "#475569" }
                        : row.source === "ISA" ? { label: "ISA Drawdown", bg: "#dcfce7", color: "#166534" }
                        : row.source === "PP" ? { label: "Pension Drawdown", bg: "#f3e8ff", color: "#6b21a8" }
                        : row.source === "ISA+PP" ? { label: "ISA + Pension", bg: "#ffedd5", color: "#c2410c" }
                        : { label: "Shortfall ⚠️", bg: "#fecdd3", color: "#be123c" };

                      return (
                        <tr key={row.age} style={{ background: rowBg, borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                          <td style={{ padding: '8px 12px', color: '#1e293b', fontWeight: 600 }}>{row.age}</td>
                          <td style={{ padding: '8px 12px' }}>
                            <span style={{ fontSize: '0.72rem', background: phaseBadge.bg, color: phaseBadge.color, padding: '2px 7px', borderRadius: '4px', fontWeight: 600 }}>
                              {phaseBadge.label}
                            </span>
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', color: '#334155' }}>{money.format(row.netIncome)}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', color: row.age > 67 ? '#15803d' : '#cbd5e1' }}>
                            {row.age > 67 ? money.format(row.postTaxSP) : '—'}
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', color: '#334155', fontWeight: 600 }}>
                            {row.phase === 'FI' ? money.format(row.netRequired) : '—'}
                          </td>
                          <td style={{ padding: '8px 12px' }}>
                            <span style={{ fontSize: '0.72rem', background: sourceBadge.bg, color: sourceBadge.color, padding: '2px 7px', borderRadius: '4px', fontWeight: 600 }}>
                              {sourceBadge.label}
                            </span>
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', color: '#334155' }}>{money.format(row.isaTotal)}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', color: row.isaChange < 0 ? '#b91c1c' : row.isaChange > 0 ? '#16a34a' : '#cbd5e1' }}>
                            {row.isaChange !== 0 ? (row.isaChange > 0 ? '+' : '') + money.format(row.isaChange) : '—'}
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', color: '#334155' }}>{money.format(row.ppTotal)}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', color: row.ppChange < 0 ? '#b91c1c' : row.ppChange > 0 ? '#16a34a' : '#cbd5e1' }}>
                            {row.ppChange !== 0 ? (row.ppChange > 0 ? '+' : '') + money.format(row.ppChange) : '—'}
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>{money.format(row.totalPot)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '8px', textAlign: 'center' }}>
                📌 Pension growth rate ({excelPpGrowth}%) is separate from ISA growth rate ({excelIsaGrowth}%). Pension withdrawals include a tax factor of {excelPpTaxFactor} (basic rate estimation). State pension starts at age 68 (age &gt; 67).
              </p>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

type RetirementSimulationRow = {
  age: number;
  expenses: number;
  fixedGrossIncome: number;
  taxPaid: number;
  accessibleWithdrawal: number;
  pensionWithdrawal: number;
  netIncome: number;
  shortfall: number;
  accessiblePot: number;
  lisaPot: number;
  pensionPot: number;
  totalPot: number;
};

type RetirementSimulationResult = {
  rows: RetirementSimulationRow[];
  firstShortfallAge: number | null;
  finalAge: number;
  finalPot: number;
  totalTaxPaid: number;
  startingAccessiblePot: number;
  startingPensionPot: number;
  startingLisaPot: number;
};

const DB_PENSION_TYPES = ['nhs-pension', 'civil-service-pension', 'teachers-pension', 'police-pension', 'firefighters-pension', 'armed-forces-pension', 'lgps-pension'];

function dbAccrualRate(bucket: any) {
  if (bucket.type === 'nhs-pension') {
    const scheme = bucket.nhsScheme || bucket.dbScheme || "2015";
    return scheme === "1995" ? 80 : scheme === "2008" ? 60 : 54;
  }
  if (bucket.type === 'civil-service-pension') {
    const scheme = bucket.dbScheme || "alpha";
    return scheme === "classic" ? 80 : (scheme === "premium" || scheme === "nuvos") ? 60 : 43.1;
  }
  if (bucket.type === 'teachers-pension') {
    const scheme = bucket.dbScheme || "2015";
    return (scheme === "classic" || scheme === "80th") ? 80 : scheme === "60th" ? 60 : 57;
  }
  if (bucket.type === 'police-pension') return 55.3;
  if (bucket.type === 'firefighters-pension') return 59.7;
  if (bucket.type === 'armed-forces-pension') return 47;
  if (bucket.type === 'lgps-pension') return 49;
  return 54;
}

function weightedRate(parts: { value: number; rate: number }[]) {
  const total = parts.reduce((sum, part) => sum + Math.max(0, part.value), 0);
  if (total <= 0) return 0;
  return parts.reduce((sum, part) => sum + Math.max(0, part.value) * (clampNumber(part.rate) / 100), 0) / total;
}

function solveGrossPensionForNetTarget(
  targetNet: number,
  fixedGrossIncome: number,
  fixedTaxableIncome: number,
  accessibleWithdrawal: number,
  taxCode: string,
  region: any,
  pensionTaxableFraction = 0.75
) {
  if (targetNet <= 0) return 0;

  let low = 0;
  let high = Math.max(100000, targetNet * 3);
  for (let i = 0; i < 60; i++) {
    const mid = (low + high) / 2;
    const tax = calculateIncomeTax(fixedTaxableIncome + mid * pensionTaxableFraction, taxCode, 0, region).totalTax;
    const net = fixedGrossIncome + accessibleWithdrawal + mid - tax;
    if (net < targetNet) low = mid;
    else high = mid;
  }
  return high;
}

function RetirementSection({
  birthYear,
  setBirthYear,
  retirementAge,
  setRetirementAge,
  targetCoastAge,
  setTargetCoastAge,
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
  nhsJobsGross,
  civilServiceJobsGross,
  teachersJobsGross,
  policeJobsGross,
  firefightersJobsGross,
  armedForcesJobsGross,
  lgpsJobsGross,
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
  includeStatePension,
  setIncludeStatePension,
  statePensionAge,
  annualStatePension,
  setAnnualStatePension,
}: {
  birthYear: number;
  setBirthYear: (y: number) => void;
  birthMonth: number;
  setBirthMonth: (m: number) => void;
  retirementAge: number;
  setRetirementAge: (a: number) => void;
  targetCoastAge: number;
  setTargetCoastAge: (a: number) => void;
  outgoings: number;
  setOutgoings: (o: number) => void;
  budgetExpenses: number;
  monthlySurplus: number;
  otherIncome: (ExpenseLine & { isTaxable?: boolean })[];
  setOtherIncome: React.Dispatch<React.SetStateAction<(ExpenseLine & { isTaxable?: boolean })[]>>;
  summary: any;
  projectedSavings: any[];
  drawdownSettings: any;  setDrawdownSettings: (s: any) => void;
  isBucketAccessible: (type: string, age: number, startWithdrawalAge?: number) => boolean;
  nhsJobsGross: number;
  civilServiceJobsGross: number;
  teachersJobsGross: number;
  policeJobsGross: number;
  firefightersJobsGross: number;
  armedForcesJobsGross: number;
  lgpsJobsGross: number;
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
  includeStatePension: boolean;
  setIncludeStatePension: (s: boolean) => void;
  statePensionAge: number;
  annualStatePension: number;
  setAnnualStatePension: (a: number) => void;
}) {
  const hasAnyLisa = projectedSavings.some((b: any) => b.type === 'lisa');
  const hasActiveLisa = projectedSavings.some((b: any) => b.type === 'lisa' && (drawdownSettings[b.id]?.enabled ?? true));
  const currentAge = (new Date().getFullYear() - birthYear) + (new Date().getMonth() + 1 - birthMonth) / 12;

  const retirementSimulation = useMemo<RetirementSimulationResult>(() => {
    const nonDbBuckets = projectedSavings.filter((bucket: any) => !bucket.isHidden && !DB_PENSION_TYPES.includes(bucket.type));
    const accessibleParts: { value: number; rate: number }[] = [];
    const lisaParts: { value: number; rate: number }[] = [];
    const pensionParts: { value: number; rate: number }[] = [];

    nonDbBuckets.forEach((bucket: any) => {
      const value = Math.max(0, clampNumber(bucket.finalBalance ?? bucket.projected ?? 0));
      if (value <= 0) return;

      if (bucket.type === 'lisa') {
        lisaParts.push({ value, rate: bucket.annualRate });
      } else if (bucket.type === 'pension' || bucket.type === 'workplace-private-pension' || bucket.type === 'workplace-pension') {
        pensionParts.push({ value, rate: bucket.annualRate });
      } else {
        accessibleParts.push({ value, rate: bucket.annualRate });
      }
    });

    let accessiblePot = accessibleParts.reduce((sum, part) => sum + part.value, 0);
    let lisaPot = lisaParts.reduce((sum, part) => sum + part.value, 0);
    let pensionPot = pensionParts.reduce((sum, part) => sum + part.value, 0);
    const accessibleGrowth = weightedRate(accessibleParts);
    const lisaGrowth = weightedRate(lisaParts);
    const pensionGrowth = weightedRate(pensionParts);

    const startingAccessiblePot = accessiblePot;
    const startingLisaPot = lisaPot;
    const startingPensionPot = pensionPot;
    const endAge = Math.max(95, Math.ceil(retirementAge) + 35, statePensionAge + 20);
    const rows: RetirementSimulationRow[] = [];
    let firstShortfallAge: number | null = null;
    let totalTaxPaid = 0;

    const dbAnnualAtAge = (bucket: any, age: number) => {
      const settings = drawdownSettings[bucket.id] || {};
      const withdrawAge = settings.useWithdrawAge ? settings.withdrawAge : (bucket.startWithdrawalAge || 67);
      if (age < withdrawAge) return 0;

      const salary = bucket.type === 'nhs-pension' ? (nhsJobsGross || bucket.nhsSalary || bucket.dbSalary || 0)
        : bucket.type === 'civil-service-pension' ? (civilServiceJobsGross || bucket.dbSalary || 0)
        : bucket.type === 'teachers-pension' ? (teachersJobsGross || bucket.dbSalary || 0)
        : bucket.type === 'police-pension' ? (policeJobsGross || bucket.dbSalary || 0)
        : bucket.type === 'firefighters-pension' ? (firefightersJobsGross || bucket.dbSalary || 0)
        : bucket.type === 'armed-forces-pension' ? (armedForcesJobsGross || bucket.dbSalary || 0)
        : bucket.type === 'lgps-pension' ? (lgpsJobsGross || bucket.dbSalary || 0)
        : (bucket.dbSalary || 0);

      const baseYears = bucket.type === 'nhs-pension'
        ? (bucket.nhsYearsService || bucket.dbYearsService || 0)
        : (bucket.dbYearsService || 0);
      const stopAge = settings.useStopAge ? settings.stopAge : bucket.stopContributingAge;
      const serviceYears = baseYears + Math.max(0, Math.min(retirementAge, stopAge || retirementAge) - currentAge);
      const annual = salary > 0 ? (salary / dbAccrualRate(bucket)) * serviceYears : 0;
      return annual * Math.pow(1 + inflationRate / 100, Math.max(0, age - currentAge));
    };

    for (let age = Math.ceil(retirementAge); age <= endAge; age++) {
      const yearsFromNow = Math.max(0, age - currentAge);
      const expenses = summary.currentMonthlyExpenses * 12 * Math.pow(1 + inflationRate / 100, yearsFromNow);

      let fixedGrossIncome = 0;
      let fixedTaxableIncome = 0;

      otherIncome.forEach((item) => {
        const startAge = item.startAge || retirementAge;
        if (age < startAge) return;
        const annual = (item.amount || 0) * 12 * (item.isInflationLinked ? Math.pow(1 + inflationRate / 100, yearsFromNow) : 1);
        fixedGrossIncome += annual;
        if (item.isTaxable) fixedTaxableIncome += annual;
      });

      projectedSavings.forEach((bucket: any) => {
        if (!bucket.isHidden && DB_PENSION_TYPES.includes(bucket.type)) {
          const annual = dbAnnualAtAge(bucket, age);
          fixedGrossIncome += annual;
          fixedTaxableIncome += annual;
        }
      });

      if (includeStatePension && age >= statePensionAge) {
        const annual = annualStatePension * Math.pow(1 + inflationRate / 100, yearsFromNow);
        fixedGrossIncome += annual;
        fixedTaxableIncome += annual;
      }

      const baselineTax = calculateIncomeTax(fixedTaxableIncome, taxSettings.taxCode, 0, taxSettings.region).totalTax;
      const fixedNetIncome = fixedGrossIncome - baselineTax;
      let netNeededFromPots = Math.max(0, expenses - fixedNetIncome);
      let accessibleWithdrawal = 0;
      let pensionWithdrawal = 0;
      let lisaWithdrawal = 0;

      const lisaCanBeUsed = age >= 60 || showLisaUnder60;
      const usableLisaValue = lisaCanBeUsed ? lisaPot * (age < 60 ? 0.75 : 1) : 0;
      let availableAccessibleValue = accessiblePot + usableLisaValue;

      if (netNeededFromPots > 0 && availableAccessibleValue > 0) {
        accessibleWithdrawal = Math.min(netNeededFromPots, availableAccessibleValue);
        const fromAccessible = Math.min(accessiblePot, accessibleWithdrawal);
        accessiblePot -= fromAccessible;
        const remainingFromLisaValue = accessibleWithdrawal - fromAccessible;
        if (remainingFromLisaValue > 0) {
          const lisaReduction = age < 60 ? remainingFromLisaValue / 0.75 : remainingFromLisaValue;
          lisaWithdrawal = remainingFromLisaValue;
          lisaPot = Math.max(0, lisaPot - lisaReduction);
        }
        netNeededFromPots -= accessibleWithdrawal;
      }

      if (netNeededFromPots > 0 && age >= pensionAccessAge && pensionPot > 0) {
        const grossNeeded = solveGrossPensionForNetTarget(
          expenses,
          fixedGrossIncome,
          fixedTaxableIncome,
          accessibleWithdrawal,
          taxSettings.taxCode,
          taxSettings.region
        );
        pensionWithdrawal = Math.min(pensionPot, grossNeeded);
        pensionPot -= pensionWithdrawal;
      }

      const taxablePension = pensionWithdrawal * 0.75;
      const taxPaid = calculateIncomeTax(fixedTaxableIncome + taxablePension, taxSettings.taxCode, 0, taxSettings.region).totalTax;
      totalTaxPaid += taxPaid;
      const netIncome = fixedGrossIncome + accessibleWithdrawal + pensionWithdrawal - taxPaid;
      const shortfall = Math.max(0, expenses - netIncome);
      if (shortfall > 1 && firstShortfallAge === null) firstShortfallAge = age;

      rows.push({
        age,
        expenses,
        fixedGrossIncome,
        taxPaid,
        accessibleWithdrawal: accessibleWithdrawal - lisaWithdrawal,
        pensionWithdrawal,
        netIncome,
        shortfall,
        accessiblePot,
        lisaPot,
        pensionPot,
        totalPot: accessiblePot + lisaPot + pensionPot,
      });

      accessiblePot *= 1 + accessibleGrowth;
      lisaPot *= 1 + lisaGrowth;
      pensionPot *= 1 + pensionGrowth;
    }

    const lastRow = rows[rows.length - 1];
    return {
      rows,
      firstShortfallAge,
      finalAge: endAge,
      finalPot: lastRow?.totalPot || 0,
      totalTaxPaid,
      startingAccessiblePot,
      startingPensionPot,
      startingLisaPot,
    };
  }, [projectedSavings, drawdownSettings, retirementAge, statePensionAge, pensionAccessAge, showLisaUnder60, summary.currentMonthlyExpenses, inflationRate, otherIncome, includeStatePension, annualStatePension, taxSettings, currentAge, nhsJobsGross, civilServiceJobsGross, teachersJobsGross, policeJobsGross, firefightersJobsGross, armedForcesJobsGross, lgpsJobsGross]);

  const firstRetirementRow = retirementSimulation.rows[0];
  const retirementStatusCovered = retirementSimulation.firstShortfallAge === null;
  const firstYearShortfall = firstRetirementRow?.shortfall || 0;
  const firstYearGrossNeeded = useMemo(() => {
    if (firstYearShortfall <= 1) return 0;
    let low = 0;
    let high = Math.max(100000, firstYearShortfall * 3);
    for (let i = 0; i < 60; i++) {
      const mid = (low + high) / 2;
      const tax = calculateIncomeTax(mid, taxSettings.taxCode, 0, taxSettings.region).totalTax;
      const ni = calculateNationalInsurance(mid, "class1");
      if (mid - tax - ni < firstYearShortfall) low = mid;
      else high = mid;
    }
    return high / 12;
  }, [firstYearShortfall, taxSettings]);

  return (
    <div className="workspace">
      <section className="panel span-12">
        <h2>Retirement Settings</h2>
        <div className="settings-grid">
          <label>Target Retirement Age 
            <NumberInput placeholder="67" value={Math.round(retirementAge) || 0} onChange={setRetirementAge} max={120} />
          </label>
          <label>Target Coast Age 
            <NumberInput placeholder="50" value={Math.round(targetCoastAge) || 0} onChange={setTargetCoastAge} max={120} />
          </label>
          <label>Assumed Annual Inflation % 
            <NumberInput placeholder="3" value={inflationRate} onChange={setInflationRate} suffix="%" />
          </label>
        </div>
        <div style={{ marginTop: '16px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input 
              type="checkbox" 
              id="includeStatePension" 
              checked={includeStatePension} 
              onChange={e => setIncludeStatePension(e.target.checked)} 
            />
            <label htmlFor="includeStatePension" style={{ fontSize: '0.9rem', color: '#666', fontWeight: 600 }}>
              Entitled to State Pension?
            </label>
          </div>
          {includeStatePension && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <label style={{ fontSize: '0.9rem', color: '#666', fontWeight: 600 }}>
                State Pension Amount:
              </label>
              <NumberInput 
                placeholder="12547.60" 
                value={annualStatePension} 
                onChange={setAnnualStatePension} 
                suffix="/yr"
              />
            </div>
          )}
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
        <details className="disclosure-section" open={!isMobile}>
          <summary><h2>Retirement Funding Analysis</h2></summary>
          <div className="disclosure-content">
            <div className="notice" style={{ marginBottom: '16px' }}>
              Select which current expenses and annual bills will continue into retirement.
            </div>
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
                    onClick={() => setAdditionalExpenses([...additionalExpenses, { id: uid(), label: "New Future Cost", amount: 0, bucket: 'living' as const }])}
                    style={{ fontSize: '0.7rem', height: '24px', minHeight: 'auto', padding: '0 8px' }}
                  >
                    + Add
                  </button>
                </h4>
                {additionalExpenses.map((item: any) => (
                  <div key={item.id} className="retirement-cost-row">
                    <div className="checkbox-field">
                      <input type="checkbox" checked readOnly style={{ opacity: 0.5 }} />
                    </div>
                    <div className="label-field">
                      <div className="mobile-label">Cost Label</div>
                      <TextInput placeholder="e.g. Travel" value={item.label} onChange={(l) => setAdditionalExpenses(updateItem(additionalExpenses, item.id, { label: l }))} />
                    </div>
                    <div className="amount-field">
                      <div className="mobile-label">Monthly Amount</div>
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
                  <div className="notice" style={{ maxWidth: 'none', fontSize: '0.75rem', marginBottom: '12px' }}>
                    This now simulates retirement year by year: taxable income, state/DB/manual income, accessible bridge money, pension access, pension tax, and the first year a shortfall appears.
                  </div>

                  <ResultRows rows={[
                    ["First-Year Target Net", firstRetirementRow?.expenses || 0],
                    ["Fixed Income Gross", -(firstRetirementRow?.fixedGrossIncome || 0)],
                    ["Tax Paid", -(firstRetirementRow?.taxPaid || 0)],
                    ["Accessible Pot Withdrawal", firstRetirementRow?.accessibleWithdrawal || 0],
                    ["Pension Gross Withdrawal", firstRetirementRow?.pensionWithdrawal || 0],
                    ["First-Year Shortfall", firstRetirementRow?.shortfall || 0],
                  ]} />
                  
                  <div className="retirement-comparison-grid">
                        <div className={`metric ${retirementStatusCovered ? 'green' : 'red'}`} style={{ minHeight: 'auto', padding: '12px' }}>
                          <span style={{ fontSize: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            Plan Status
                            <span className="tooltip-trigger" data-tooltip={`Simulated annually from age ${Math.ceil(retirementAge)} to ${retirementSimulation.finalAge}.`}>
                              ⓘ
                            </span>
                          </span>
                          <strong style={{ fontSize: '1.2rem' }}>{retirementStatusCovered ? 'Covered' : `Shortfall age ${retirementSimulation.firstShortfallAge}`}</strong>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                            <small style={{ fontSize: '0.65rem', color: '#666' }}>Final pot at {retirementSimulation.finalAge}</small>
                            <small style={{ fontSize: '0.7rem', fontWeight: 800 }}>{money.format(retirementSimulation.finalPot)}</small>
                          </div>
                        </div>
                      <div className="metric isa-card green" style={{ minHeight: 'auto', padding: '12px' }}>
                        <span style={{ fontSize: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          Starting Accessible/LISA
                        </span>
                        <strong style={{ fontSize: '1.2rem' }}>{money.format(retirementSimulation.startingAccessiblePot + retirementSimulation.startingLisaPot)}</strong>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                          <small style={{ fontSize: '0.65rem', color: '#666' }}>LISA unlocks at age 60 unless early use is enabled</small>
                        </div>
                      </div>
                      <div className={`metric ${firstYearGrossNeeded > 0 ? 'red' : 'green'}`} style={{ minHeight: 'auto', padding: '12px' }}>
                        <span style={{ fontSize: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          Monthly Gross Earnings Needed
                          <span className="tooltip-trigger" data-tooltip={`Only shown when the first simulated retirement year has a net shortfall after using available pots and income.`}>
                            ⓘ
                          </span>
                        </span>
                        <strong style={{ fontSize: '1.2rem' }}>{monthlyMoney.format(firstYearGrossNeeded)}</strong>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                          <small style={{ fontSize: '0.65rem', color: '#666' }}>First simulated retirement year</small>
                          <small style={{ fontSize: '0.7rem', fontWeight: 800 }}>
                            {firstYearGrossNeeded > 0 ? 'SHORTFALL' : 'COVERED'}
                          </small>
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
                <NumberInput placeholder="10" value={parseFloat(projectionYears.toFixed(2))} onChange={setProjectionYears} suffix="yrs" />
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
                const settings = drawdownSettings[bucket.id] || { rate: 0, lumpSumTaken: false, useStopAge: false, useWithdrawAge: false, stopAge: 60, withdrawAge: 60 };
                
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
                          placeholder="0"
                          value={settings.rate ?? 0} 
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
                            <NumberInput value={settings.stopAge} onChange={(val) => setDrawdownSettings({...drawdownSettings, [bucket.id]: {...settings, stopAge: val}})} max={120} />
                          </div>
                        )}
                        </div>
                        </div>
                        <div>
                        <div className="mobile-label">Withdrawal Age</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <NumberInput value={settings.withdrawAge} onChange={(val) => setDrawdownSettings({...drawdownSettings, [bucket.id]: {...settings, withdrawAge: val}})} max={120} />
                        </div>                    </div>
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
                onClick={(e) => { e.stopPropagation(); setOtherIncome([...otherIncome, {id: uid(), label: "Other Income", amount: 0, isTaxable: true, bucket: 'living' as const}]) }}
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
              <div className="income-source-row header desktop-only">
                <span>Source</span>
                <span>Monthly Amount</span>
                <span>Start Age</span>
                <span>Taxable?</span>
                <span>Inflation Linked?</span>
                <span></span>
              </div>
              {otherIncome.map((item: any) => (
                <div key={item.id} className="income-source-row">
                  <div><div className="mobile-label">Source</div><TextInput placeholder="e.g. Rental Income" value={item.label} onChange={(l) => setOtherIncome(updateItem<any>(otherIncome, item.id, { label: l }))} /></div>
                  <div><div className="mobile-label">Monthly Gross Amount</div><NumberInput placeholder="0" value={item.amount} onChange={(a) => setOtherIncome(updateItem<any>(otherIncome, item.id, { amount: a }))} /></div>
                  <div><div className="mobile-label">Start Age</div><NumberInput placeholder="Retire Age" value={item.startAge || 0} onChange={(a) => setOtherIncome(updateItem<any>(otherIncome, item.id, { startAge: a }))} max={120} /></div>
                  <div><div className="mobile-label">Taxable?</div>
                    <input 
                      type="checkbox" 
                      checked={item.isTaxable ?? false} 
                      onChange={(e) => setOtherIncome(updateItem<any>(otherIncome, item.id, { isTaxable: e.target.checked }))} 
                    />
                  </div>
                  <div><div className="mobile-label">Subject to Inflation?</div>
                    <input 
                      type="checkbox" 
                      checked={item.isInflationLinked ?? false} 
                      onChange={(e) => setOtherIncome(updateItem<any>(otherIncome, item.id, { isInflationLinked: e.target.checked }))} 
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
        <h2>Retirement Cost Summary</h2>
        <ResultRows rows={[
          ["Costs in today's money (monthly)", -summary.currentMonthlyExpenses],
          [`Costs at retirement (inflated ${projectionYears.toFixed(1)} yrs)`, -(firstRetirementRow?.expenses || 0) / 12],
          ["Avg. net income across retirement", retirementSimulation.rows.length > 0 ? retirementSimulation.rows.reduce((sum, r) => sum + r.netIncome, 0) / retirementSimulation.rows.length / 12 : 0],
          ["Final pot remaining", retirementSimulation.finalPot],
        ]} />
        <div style={{ marginTop: '16px', fontSize: '0.85rem', borderTop: '1px solid #eee', paddingTop: '12px' }}>
          <span style={{ fontWeight: 700, color: retirementStatusCovered ? '#2c7363' : '#a7332f' }}>
            {retirementStatusCovered
              ? `✓ Pot covers full retirement to age ${retirementSimulation.finalAge}`
              : `⚠ First shortfall projected at age ${retirementSimulation.firstShortfallAge}`}
          </span>
          <p style={{ color: '#666', marginTop: '6px' }}>Simulated age {Math.ceil(retirementAge)} → {retirementSimulation.finalAge}, using {inflationRate}% inflation, pension-access timing, and selected retirement costs.</p>
        </div>
        {hasActiveLisa && retirementAge < 60 && showLisaUnder60 && (
          <p style={{color: '#a7332f', fontSize: '0.85rem', marginTop: '10px', fontWeight: 600}}>
            * Early LISA use applies a 25% withdrawal penalty in the simulation.
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
          simulation={retirementSimulation}
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
  budgetLines,
  excludedBudgetLines,
  setExcludedBudgetLines,
  savings,
  excludedSavings,
  setExcludedSavings,
  mortgages,
}: {
  budget: any;
  tax: ReturnType<typeof calculateTaxSummary>;
  targetGross: number;
  sippNetContribution: number;
  taxSetAside: number;
  setActiveSection: (section: SectionId) => void;
  taxSettings: TaxSettings;
  setTaxSettings: (s: TaxSettings) => void;
  budgetLines: BudgetLine[];
  excludedBudgetLines: string[];
  setExcludedBudgetLines: (ids: string[]) => void;
  savings: SavingsBucket[];
  excludedSavings: string[];
  setExcludedSavings: (ids: string[]) => void;
  mortgages: MortgageInputs[];
}) {
  const [showPensionInput, setShowPensionInput] = useState(!!taxSettings.pensionRate);

  const totalOverpayment = mortgages.reduce((sum, m) => sum + m.monthlyOverpayment, 0);

  return (
    <div className="workspace overview-workspace">
      <section className="panel span-8">
        <h2>Current Plan</h2>
        <ResultRows
          rows={[
            ["Monthly income (gross cash)", tax.cashMonthlyNet + tax.studentLoanTotal / 12],
            ["Tax set-aside", -taxSetAside],
            ...(tax.studentLoanTotal > 0 ? [["Student loan", -tax.studentLoanTotal / 12] as [string, number]] : []),
            ["Monthly expenses", -budget.monthlyExpenses],
            ["Monthly savings", -budget.monthlySavings],
            ["Monthly surplus", budget.monthlySurplus],
          ]}
        />
      </section>

      <section className="panel span-8" style={{ marginTop: '20px' }}>
        <h2>Gross Income Analysis</h2>
        <ResultRows
          rows={[
            ["Gross income needed for selected lines", targetGross],
          ]}
        />
        
        <details className="disclosure-section" style={{ marginTop: '20px' }}>
          <summary>Included Budget & Savings Lines</summary>
          <div className="disclosure-content">
            <h4>Budget Lines</h4>
            {budgetLines.map(line => (
              <label key={line.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 0' }}>
                <input
                  type="checkbox"
                  checked={!excludedBudgetLines.includes(line.id)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setExcludedBudgetLines(excludedBudgetLines.filter(id => id !== line.id));
                    } else {
                      setExcludedBudgetLines([...excludedBudgetLines, line.id]);
                    }
                  }}
                />
                {line.label} ({monthlyMoney.format(line.amount)})
              </label>
            ))}
            <h4 style={{marginTop: '15px'}}>Savings & Overpayments</h4>
            {savings.map(s => (
              <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 0' }}>
                <input
                  type="checkbox"
                  checked={!excludedSavings.includes(s.id)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setExcludedSavings(excludedSavings.filter(id => id !== s.id));
                    } else {
                      setExcludedSavings([...excludedSavings, s.id]);
                    }
                  }}
                />
                {s.label} ({monthlyMoney.format(s.monthly)})
              </label>
            ))}
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 0', fontWeight: 'bold' }}>
              <input
                type="checkbox"
                checked={!excludedSavings.includes('mortgage-overpayment')}
                onChange={(e) => {
                  if (e.target.checked) {
                    setExcludedSavings(excludedSavings.filter(id => id !== 'mortgage-overpayment'));
                  } else {
                    setExcludedSavings([...excludedSavings, 'mortgage-overpayment']);
                  }
                }}
              />
              Mortgage Overpayment ({monthlyMoney.format(totalOverpayment)})
            </label>
          </div>
        </details>

        <div style={{ marginTop: '16px', fontSize: '0.85rem', color: '#666', borderTop: '1px solid #eee', paddingTop: '12px' }}>
          <p><strong>Note:</strong> Gross income calculation includes Income Tax and National Insurance deductions, plus any optional deductions selected below.</p>
        </div>
        
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
              pay about {money.format(tax.sippNetNeededToReach100k/12)} net per month into a relief-at-source SIPP. Current net SIPP
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
  taxSettings,
}: {
  paye: PayeIncome[];
  setPaye: React.Dispatch<React.SetStateAction<PayeIncome[]>>;
  selfEmployment: SelfEmployment[];
  setSelfEmployment: React.Dispatch<React.SetStateAction<SelfEmployment[]>>;
  savings: SavingsBucket[];
  setSavings: React.Dispatch<React.SetStateAction<SavingsBucket[]>>;
  taxSettings: TaxSettings;
}) {
  const hasNhsJob = paye.some(j => j.pensionType === 'nhs');
  const hasCivilServiceJob = paye.some(j => j.pensionType === 'civil-service');
  const hasTeachersJob = paye.some(j => j.pensionType === 'teachers');

  const nhsBucket = savings.find(s => s.type === 'nhs-pension');
  const civilServiceBucket = savings.find(s => s.type === 'civil-service-pension');
  const teachersBucket = savings.find(s => s.type === 'teachers-pension');
  const policeBucket = savings.find(s => s.type === 'police-pension');
  const firefightersBucket = savings.find(s => s.type === 'firefighters-pension');
  const armedForcesBucket = savings.find(s => s.type === 'armed-forces-pension');
  const lgpsBucket = savings.find(s => s.type === 'lgps-pension');

  const nhsJobsGross = paye.filter(j => j.pensionType === 'nhs').reduce((sum, j) => sum + j.gross, 0);
  const civilServiceJobsGross = paye.filter(j => j.pensionType === 'civil-service').reduce((sum, j) => sum + j.gross, 0);
  const teachersJobsGross = paye.filter(j => j.pensionType === 'teachers').reduce((sum, j) => sum + j.gross, 0);
  const policeJobsGross = paye.filter(j => j.pensionType === 'police').reduce((sum, j) => sum + j.gross, 0);
  const firefightersJobsGross = paye.filter(j => j.pensionType === 'firefighters').reduce((sum, j) => sum + j.gross, 0);
  const armedForcesJobsGross = paye.filter(j => j.pensionType === 'armed-forces').reduce((sum, j) => sum + j.gross, 0);
  const lgpsJobsGross = paye.filter(j => j.pensionType === 'lgps').reduce((sum, j) => sum + j.gross, 0);

  const showPie = (paye.length + selfEmployment.length) > 1;

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

  const ensurePoliceBucket = () => {
    if (!policeBucket) {
      setSavings([...savings, { id: uid(), label: "Police Pension", balance: 0, monthly: 0, annualRate: 0, type: "police-pension", dbScheme: "2015", dbYearsService: 0 }]);
    }
  };

  const ensureFirefightersBucket = () => {
    if (!firefightersBucket) {
      setSavings([...savings, { id: uid(), label: "Firefighters' Pension", balance: 0, monthly: 0, annualRate: 0, type: "firefighters-pension", dbScheme: "2015", dbYearsService: 0 }]);
    }
  };

  const ensureArmedForcesBucket = () => {
    if (!armedForcesBucket) {
      setSavings([...savings, { id: uid(), label: "Armed Forces Pension", balance: 0, monthly: 0, annualRate: 0, type: "armed-forces-pension", dbScheme: "2015", dbYearsService: 0 }]);
    }
  };

  const ensureLgpsBucket = () => {
    if (!lgpsBucket) {
      setSavings([...savings, { id: uid(), label: "LGPS Pension", balance: 0, monthly: 0, annualRate: 0, type: "lgps-pension", dbScheme: "Main", dbYearsService: 0 }]);
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
      {showPie && (
        <section className="panel span-4" style={{ gridRow: 'span 2' }}>
          <h2>Income Distribution (Net)</h2>
          <IncomePie paye={paye} selfEmployment={selfEmployment} taxSettings={taxSettings} />
        </section>
      )}

      <section className={`panel ${showPie ? 'span-8' : 'span-12'}`}>
        <details className="disclosure-section" open={!isMobile}>
          <summary>
            <PanelHeader
              title="PAYE Income"
              actionLabel="Add PAYE"
              onAction={() =>
                setPaye([...paye, { id: uid(), label: "New PAYE job", gross: 0, pensionRate: 0, employerPensionContribution: 0, pensionType: "" as any }])
              }
            />
          </summary>
          <div className="disclosure-content">
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
                       patch.employerPensionContribution = NHS_EMPLOYER_RATE;
                    } else if (income.pensionType === 'civil-service') {
                       patch.pensionRate = calculateCivilServiceEmployeeRate(gross);
                       patch.employerPensionContribution = 28.97;
                    } else if (income.pensionType === 'teachers') {
                       patch.pensionRate = calculateTeachersEmployeeRate(gross);
                       patch.employerPensionContribution = 28.6;
                    } else if (income.pensionType === 'police') {
                       patch.pensionRate = calculatePoliceEmployeeRate(gross);
                       patch.employerPensionContribution = 35.3;
                    } else if (income.pensionType === 'firefighters') {
                       patch.pensionRate = calculateFirefightersEmployeeRate(gross);
                       patch.employerPensionContribution = 37.6;
                    } else if (income.pensionType === 'armed-forces') {
                       patch.pensionRate = 0;
                       patch.employerPensionContribution = 73.5;
                    } else if (income.pensionType === 'lgps') {
                       patch.pensionRate = calculateLgpsEmployeeRate(gross);
                       patch.employerPensionContribution = 20.0; // LGPS varies significantly by authority; 20% is a common benchmark
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
                        patch.employerPensionContribution = NHS_EMPLOYER_RATE;
                        ensureNhsBucket();
                      } else if (val === 'civil-service') {
                        patch.pensionRate = calculateCivilServiceEmployeeRate(income.gross);
                        patch.employerPensionContribution = 28.97;
                        ensureCivilServiceBucket();
                      } else if (val === 'teachers') {
                        patch.pensionRate = calculateTeachersEmployeeRate(income.gross);
                        patch.employerPensionContribution = 28.6;
                        ensureTeachersBucket();
                      } else if (val === 'police') {
                        patch.pensionRate = calculatePoliceEmployeeRate(income.gross);
                        patch.employerPensionContribution = 35.3;
                        ensurePoliceBucket();
                      } else if (val === 'firefighters') {
                        patch.pensionRate = calculateFirefightersEmployeeRate(income.gross);
                        patch.employerPensionContribution = 37.6;
                        ensureFirefightersBucket();
                      } else if (val === 'armed-forces') {
                        patch.pensionRate = 0;
                        patch.employerPensionContribution = 73.5;
                        ensureArmedForcesBucket();
                      } else if (val === 'lgps') {
                        patch.pensionRate = calculateLgpsEmployeeRate(income.gross);
                        patch.employerPensionContribution = 20.0;
                        ensureLgpsBucket();
                      } else if (val === 'standard') {
                        ensureWorkplacePensionBucket(income);
                      }
                      setPaye(updateItem(paye, income.id, patch));
                    }}>
                      <option value="" disabled>--select--</option>
                      <option value="standard">Standard</option>
                      <option value="nhs">NHS</option>
                      <option value="civil-service">Civil Service</option>
                      <option value="teachers">Teachers</option>
                      <option value="police">Police</option>
                      <option value="firefighters">Firefighters</option>
                      <option value="armed-forces">Armed Forces</option>
                      <option value="lgps">LGPS</option>
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
          </div>
        </details>
      </section>

      <section className={`panel ${showPie ? 'span-8' : 'span-12'}`}>
        <details className="disclosure-section" open={!isMobile}>
          <summary>
            <PanelHeader
              title="Self-Employment Income"
              actionLabel="Add SE Stream"
              onAction={() =>
                setSelfEmployment([...selfEmployment, { id: uid(), label: "New SE source", gross: 0, expenses: [], isNiLiable: true }])
              }
            />
          </summary>
          <div className="disclosure-content">
            <div className="se-list">
              {selfEmployment.map((stream) => (
                <div className="se-card" key={stream.id}>
                  <div className="se-card-header">
                    <TextInput placeholder="Stream Label" value={stream.label} onChange={(label) => setSelfEmployment(updateItem(selfEmployment, stream.id, { label }))} />
                    <button className="delete-btn" onClick={() => setSelfEmployment(selfEmployment.filter((s: any) => s.id !== stream.id))}>×</button>
                  </div>
                  <div className="se-card-body">
                    <label>Annual Gross Revenue
                      <NumberInput placeholder="0" value={stream.gross} onChange={(gross) => setSelfEmployment(updateItem(selfEmployment, stream.id, { gross }))} />
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={stream.isNiLiable ?? true} onChange={(e) => setSelfEmployment(updateItem(selfEmployment, stream.id, { isNiLiable: e.target.checked }))} />
                      <span style={{ fontSize: '0.85rem' }}>Liable for Class 4 NI?</span>
                    </label>

                    <div className="mini-expenses">
                      <div className="mini-expenses-header">
                        <h4>Annual Business Expenses</h4>
                        <button onClick={() => {
                          const expenses: ExpenseLine[] = [...stream.expenses, { id: uid(), label: "New expense", amount: 0, bucket: 'professional' as const }];
                          setSelfEmployment(updateItem(selfEmployment, stream.id, { expenses }));
                        }}>+ Add</button>
                      </div>
                      {stream.expenses.map((expense) => (
                        <div key={expense.id} className="mini-expense-row">
                          <TextInput placeholder="Expense label" value={expense.label} onChange={(l) => updateExpense(stream.id, expense.id, { label: l }, selfEmployment, setSelfEmployment)} />
                          <NumberInput placeholder="0" value={expense.amount} onChange={(a) => updateExpense(stream.id, expense.id, { amount: a }, selfEmployment, setSelfEmployment)} />
                          <button onClick={() => {
                            const expenses = stream.expenses.filter((e: any) => e.id !== expense.id);
                            setSelfEmployment(updateItem(selfEmployment, stream.id, { expenses }));
                          }}>×</button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </details>
      </section>

      {hasNhsJob && (
        <section className={`panel ${showPie ? 'span-8' : 'span-12'}`} style={{ background: '#f0f7ff', border: '2px dashed #3182ce' }}>
          <details className="disclosure-section" open={!isMobile}>
            <summary>
              <div className="split-title">
                <h2>NHS Pension Configuration</h2>
                <div className="notice" style={{ maxWidth: 'none', border: 'none', padding: 0 }}>
                  Based on your NHS job(s), we need a few more details to estimate your retirement income.
                </div>
              </div>
            </summary>
            <div className="disclosure-content">
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
            </div>
          </details>
        </section>
      )}

      {hasCivilServiceJob && (
        <section className={`panel ${showPie ? 'span-8' : 'span-12'}`} style={{ background: '#f6f1ff', border: '2px dashed #805ad5' }}>
          <details className="disclosure-section" open={!isMobile}>
            <summary>
              <div className="split-title">
                <h2>Civil Service Pension Configuration</h2>
                <div className="notice" style={{ maxWidth: 'none', border: 'none', padding: 0 }}>
                  Provide details for your Civil Service pension estimation.
                </div>
              </div>
            </summary>
            <div className="disclosure-content">
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
            </div>
          </details>
        </section>
      )}

      {hasTeachersJob && (
        <section className={`panel ${showPie ? 'span-8' : 'span-12'}`} style={{ background: '#fff5f5', border: '2px dashed #e53e3e' }}>
          <details className="disclosure-section" open={!isMobile}>
            <summary>
              <div className="split-title">
                <h2>Teachers' Pension Configuration</h2>
                <div className="notice" style={{ maxWidth: 'none', border: 'none', padding: 0 }}>
                  Provide details for your Teachers' pension estimation.
                </div>
              </div>
            </summary>
            <div className="disclosure-content">
              {teachersBucket ? (
                <div className="settings-grid">
                  <label>Total Years of Service (to date) 
                    <NumberInput placeholder="0" value={teachersBucket.dbYearsService || 0} onChange={(val) => setSavings(updateItem(savings, teachersBucket.id, { dbYearsService: val }))} />
                  </label>
                  <label>Pension Scheme
                    <select value={teachersBucket.dbScheme || "2015"} onChange={(e) => setSavings(updateItem(savings, teachersBucket.id, { dbScheme: e.target.value as any }))}>
                      <option value="classic">Classic (1/80)</option>
                      <option value="80th">80th Scheme (1/80)</option>
                      <option value="60th">60th Scheme (1/60)</option>
                      <option value="2015">2015 Scheme (1/57)</option>
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
            </div>
          </details>
        </section>
      )}
    </div>
  );
}

function TaxSection({ tax, sippNetContribution }: any) {
  const taxable = Number(tax.payeTaxable || 0);
  const selfEmployedProfit = Number(tax.selfProfit || 0);
  const interestIncome = Number(tax.annualSavingsInterest || 0);
  const allowance = Number(tax.combinedTax?.allowance || 0);
  const psaAllowance = Number(tax.psaAllowance || 0);

  const taxableTotal = taxable + selfEmployedProfit;
  const adjustedNet = tax.combinedTax?.adjustedNetIncome || 0;

  const sippNeededFor100k = tax.sippNetNeededToReach100k || 0;
  const sippNeededForBasic = tax.sippNetToStayBasic || 0;

  // Recommendations logic
  const show100kRec = sippNeededFor100k > 0 && sippNeededFor100k < 40000; // Only show if realistically achievable
  const showBasicRec = sippNeededForBasic > 0 && sippNeededForBasic < 10000; // Focus on those near the boundary

  return (
    <div className="workspace">
      <section className="panel span-12">
        <h2>Tax Estimate</h2>
        <ResultRows
          rows={[
            ["PAYE taxable", money.format(taxable)],
            ["Self-employed profit", money.format(selfEmployedProfit)],
            ["Savings interest (Non-ISA)", money.format(interestIncome)],
            ["Adjusted net income", money.format(adjustedNet)],
            ["Personal allowance", money.format(allowance)],
            ["Personal savings allowance", money.format(psaAllowance)],
            ["Income tax", money.format(Number(tax.combinedTax?.totalTax || 0))],
            ["Tax on interest", money.format(Number(tax.interestTax || 0))],
            ["National Insurance", money.format(Number(tax.totalNi || 0))],
            ["Student Loan", money.format(Number(tax.studentLoanTotal || 0))],
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

        {(show100kRec || showBasicRec) && (
          <div className="callout amber" style={{ marginTop: '24px' }}>
            <h2>Optimization Advice</h2>
            <div style={{ display: 'grid', gap: '12px', marginTop: '12px' }}>
              {show100kRec && (
                <div>
                  <strong>Avoid 60% Tax Rate:</strong> Your income is over £100,000. 
                  By contributing an extra <strong>{money.format(sippNeededFor100k)}</strong> (net) to your SIPP, 
                  you can restore your full Personal Allowance and avoid the effective 60% tax rate.
                </div>
              )}
              {showBasicRec && (
                <div>
                  <strong>Keep £1,000 Savings Allowance:</strong> You are currently in the 40% tax bracket. 
                  By contributing an extra <strong>{money.format(sippNeededForBasic)}</strong> (net) annually to your SIPP, 
                  you would drop back to the 20% bracket, which increases your Personal Savings Allowance from £500 to £1,000.
                </div>
              )}
            </div>
          </div>
        )}

        {!show100kRec && !showBasicRec && (
          <div className="callout" style={{ marginTop: '24px', background: '#e2e8f0' }}>
            <strong>Tax Efficiency:</strong> Your adjusted net income is currently in a tax-efficient range relative to the major thresholds.
          </div>
        )}
      </section>
    </div>
  );
}
function SettingsSection({
  taxSettings, setTaxSettings,
  birthYear, setBirthYear,
  birthMonth, setBirthMonth,
  tax,
  onLoadDemo,
  showMortgageCard, setShowMortgageCard,
  showAssetsCard, setShowAssetsCard,
  showCoastFireCard, setShowCoastFireCard
}: any) {
  return (
    <div className="workspace">
      <section className="panel span-6">
        <div className="split-title">
          <h2>Tax Settings</h2>
          <div style={{ display: 'flex', gap: '8px' }}>
            <select 
              className="secondary" 
              style={{ fontSize: '0.75rem', height: '32px', width: 'auto' }}
              onChange={(e) => {
                if (e.target.value) {
                  onLoadDemo(e.target.value as any);
                  e.target.value = ""; // Reset select
                }
              }}
            >
              <option value="">Seed Demo...</option>
              <option value="nurse">34y Nurse (NHS)</option>
              <option value="banker">60y Banker (Wealthy)</option>
              <option value="plumber">40y Plumber (Ex-AF)</option>
              <option value="analyst">25y Analyst (Student Loan)</option>
            </select>
          </div>
        </div>
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
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginTop: '8px' }}>
            <input 
              type="checkbox" 
              checked={taxSettings.includeStudentLoan} 
              onChange={(e) => setTaxSettings({ ...taxSettings, includeStudentLoan: e.target.checked })}
            />
            Include Student Loan (Plan 2)
          </label>
        </div>
        <div style={{ marginTop: '20px', borderTop: '1px solid #eee', paddingTop: '20px' }}>
          <h3>Dashboard Layout</h3>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginTop: '8px' }}>
            <input type="checkbox" checked={showMortgageCard} onChange={(e) => setShowMortgageCard(e.target.checked)} />
            Show Mortgage Card
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginTop: '8px' }}>
            <input type="checkbox" checked={showAssetsCard} onChange={(e) => setShowAssetsCard(e.target.checked)} />
            Show Assets Card
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginTop: '8px' }}>
            <input type="checkbox" checked={showCoastFireCard} onChange={(e) => setShowCoastFireCard(e.target.checked)} />
            Show Coast FIRE Card
          </label>
        </div>
        <div className="callout neutral">
          <ResultRows
            rows={[
              ["Personal allowance", tax.combinedTax.allowance],
              ["Income tax", tax.combinedTax.totalTax],
              ["National Insurance", tax.totalNi],
              ["Student Loan", tax.studentLoanTotal],
            ]}
          />
        </div>
      </section>

      <section className="panel span-6">
        <h2>Profile Details</h2>
        <div className="settings-grid">
          <label>Birth Year 
            <NumberInput 
              placeholder="YYYY" 
              value={birthYear} 
              onChange={(val) => {
                const currentYear = new Date().getFullYear();
                const minYear = currentYear - 120;
                setBirthYear(Math.max(minYear, val));
              }} 
            />
          </label>
          <label>Birth Month (1-12) 
            <NumberInput 
              placeholder="MM" 
              value={birthMonth} 
              onChange={(val) => setBirthMonth(Math.max(1, Math.min(12, val)))} 
            />
          </label>
        </div>
        <p className="notice" style={{ maxWidth: 'none' }}>
          These details are used to calculate your current age and pension access dates.
        </p>
      </section>    </div>
  );
}

function calculateJobNet(gross: number, type: "class1" | "class4", taxSettings: TaxSettings) {
  const taxable = gross; // Simplified
  const tax = calculateIncomeTax(taxable, taxSettings.taxCode, 0, taxSettings.region).totalTax;
  const ni = calculateNationalInsurance(gross, type);
  return gross - tax - ni;
}

function IncomePie({ paye, selfEmployment, taxSettings }: { paye: PayeIncome[], selfEmployment: SelfEmployment[], taxSettings: TaxSettings }) {
  const palette = [
    "#64cdba", // Teal
    "#86a2df", // Blue
    "#a26013", // Gold/Amber
    "#5d675f", // Muted Green
    "#250dbd", // Deep Blue
    "#ab2cdd", // Purple
    "#cd7625", // Orange
    "#8a0d13", // Red
    "#05da8c", // Bright Green
    "#d4af37", // Metallic Gold
  ];

  const sources = [
    ...paye.map((j, i) => ({ 
      label: j.label, 
      value: calculateJobNet(j.gross, "class1", taxSettings), 
      color: palette[i % palette.length] 
    })),
    ...selfEmployment.map((s, i) => ({ 
      label: s.label, 
      value: calculateJobNet(s.gross, "class4", taxSettings), 
      color: palette[(i + paye.length) % palette.length] 
    }))
  ].filter(s => s.value > 0);

  const total = sources.reduce((sum, s) => sum + s.value, 0);

  if (sources.length <= 1 || total === 0) return null;

  let currentAngle = 0;
  const radius = 75;
  const cx = 100;
  const cy = 100;

  return (
    <div className="donut-container" style={{ marginBottom: '20px' }}>
      <div className="donut-svg-wrapper">
        <svg viewBox="0 0 200 200" width="100%" height="100%">
          {sources.map((src) => {
            const percentage = src.value / total;
            const angle = percentage * 360;
            
            // Handle full circle case
            if (percentage >= 0.999) {
              return (
                <circle
                  key={src.label}
                  cx={cx}
                  cy={cy}
                  r={radius}
                  fill={src.color}
                />
              );
            }

            const x1 = cx + radius * Math.cos((currentAngle - 90) * (Math.PI / 180));
            const y1 = cy + radius * Math.sin((currentAngle - 90) * (Math.PI / 180));
            const x2 = cx + radius * Math.cos((currentAngle + angle - 90) * (Math.PI / 180));
            const y2 = cy + radius * Math.sin((currentAngle + angle - 90) * (Math.PI / 180));

            const largeArcFlag = angle > 180 ? 1 : 0;
            const pathData = `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2} Z`;

            const segment = (
              <path
                key={src.label}
                d={pathData}
                fill={src.color}
                stroke="#fff"
                strokeWidth="1"
              />
            );

            currentAngle += angle;
            return segment;
          })}
        </svg>
      </div>
      <div className="donut-legend">
        {sources.map((src) => (
          <div key={src.label} className="legend-item">
            <span className="legend-color" style={{ backgroundColor: src.color }}></span>
            <span className="legend-label">{src.label}</span>
            <span className="legend-value">{monthlyMoney.format(src.value / 12)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BudgetDonut({ budget }: { budget: ReturnType<typeof budgetSummary> }) {
  const categories = [
    { label: "Housing", value: budget.totals.housing, color: "#64cdba" },
    { label: "Food", value: budget.totals.food, color: "#86a2df" },
    { label: "Entertainment", value: budget.totals.entertainment, color: "#a26013" },
    { label: "Living", value: budget.totals.living, color: "#5d675f" },
    { label: "Debt", value: budget.totals.debt, color: "#250dbd" },
    { label: "Tax", value: budget.totals.tax, color: "#05da8c" },
    { label: "Savings", value: budget.monthlySavings, color: "#8a0d13" },
    { label: "Professional", value: budget.totals.professional, color: "#cd7625" },
    { label: "Annual Bills", value: budget.annualBillsMonthly, color: "#ab2cdd" },
  ].filter(c => c.value > 0);

  const total = budget.monthlyOut;

  if (total === 0) {
    return (
      <div className="donut-placeholder">
        Add some income or expenses to see your spending breakdown.
      </div>
    );
  }

  let currentAngle = 0;
  const radius = 75;
  const cx = 100;
  const cy = 100;
  const strokeWidth = 25;

  return (
    <div className="donut-container">
      <div className="donut-svg-wrapper">
        <svg viewBox="0 0 200 200" width="100%" height="100%">
          {categories.map((cat) => {
            const percentage = cat.value / total;
            const angle = percentage * 360;
            
            if (percentage >= 0.999) {
              return (
                <circle
                  key={cat.label}
                  cx={cx}
                  cy={cy}
                  r={radius}
                  fill="none"
                  stroke={cat.color}
                  strokeWidth={strokeWidth}
                  className="donut-segment"
                />
              );
            }

            const x1 = cx + radius * Math.cos((currentAngle - 90) * Math.PI / 180);
            const y1 = cy + radius * Math.sin((currentAngle - 90) * Math.PI / 180);
            
            currentAngle += angle;
            
            const x2 = cx + radius * Math.cos((currentAngle - 90) * Math.PI / 180);
            const y2 = cy + radius * Math.sin((currentAngle - 90) * Math.PI / 180);

            const largeArcFlag = angle > 180 ? 1 : 0;
            const d = `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}`;

            return (
              <path
                key={cat.label}
                d={d}
                fill="none"
                stroke={cat.color}
                strokeWidth={strokeWidth}
                className="donut-segment"
              />
            );
          })}
        </svg>
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }} className="donut-center-text">
          <span className="donut-total-label">Total Out</span>
          <span className="donut-total-value">{monthlyMoney.format(total)}</span>
        </div>
      </div>

      <div className="donut-legend">
        {categories.map((cat) => (
          <div key={cat.label} className="legend-item">
            <span className="legend-color" style={{ backgroundColor: cat.color }}></span>
            <span className="legend-label">{cat.label}</span>
            <span className="legend-value">{monthlyMoney.format(cat.value)}</span>
          </div>
        ))}
      </div>
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
      <section className="panel span-4" style={{ gridRow: 'span 2' }}>
        <h2>Spending Breakdown</h2>
        <BudgetDonut budget={budget} />
      </section>

      <section className="panel span-8">
        <details className="disclosure-section" open={!isMobile}>
          <summary>
            <PanelHeader title="Monthly Expenses" actionLabel="Add expense" onAction={() => setBudgetLines([...budgetLines, { id: uid(), label: "New expense", amount: 0, bucket: "living" as const }])} />
          </summary>
          <div className="disclosure-content">
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
          </div>
        </details>
      </section>

      <section className="panel span-8">
        <details className="disclosure-section" open={!isMobile}>
          <summary>
            <PanelHeader title="Annual Bills" actionLabel="Add annual bill" onAction={() => setAnnualBills([...annualBills, { id: uid(), label: "Annual bill", amount: 0, bucket: 'living' as const }])} />
          </summary>
          <div className="disclosure-content">
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
          </div>
        </details>
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

function WealthSummaryCard({ savings, mortgages = [], assets = [], currentAge }: { savings: SavingsBucket[], mortgages: MortgageInputs[], assets: Asset[], currentAge: number }) {
  const summary = useMemo(() => {
    const savingsSummary = savings.reduce((acc, bucket) => {
      const { currentValue, contributed, other } = calculateCurrentBucketValue(bucket);
      const accessible = isBucketAccessible(bucket, currentAge);

      if (accessible) {
        if (bucket.type === 'cash') acc.accessibleBreakdown.cash += currentValue;
        else if (bucket.type === 'isa') acc.accessibleBreakdown.isa += currentValue;
        else if (bucket.type === 'lisa') acc.accessibleBreakdown.lisa += currentValue;
      }

      return {
        totalValue: acc.totalValue + currentValue,
        contributed: acc.contributed + contributed,
        other: acc.other + other,
        accessible: acc.accessible + (accessible ? currentValue : 0),
        locked: acc.locked + (accessible ? 0 : currentValue),
        accessibleBreakdown: acc.accessibleBreakdown,
      };
    }, { 
      totalValue: 0, 
      contributed: 0, 
      other: 0, 
      accessible: 0, 
      locked: 0,
      accessibleBreakdown: { cash: 0, isa: 0, lisa: 0 }
    });

    const assetsTotal = assets.reduce((sum, a) => sum + a.value, 0);
    
    return {
      ...savingsSummary,
      totalValue: savingsSummary.totalValue + assetsTotal,
      assetsTotal
    };
  }, [savings, assets, currentAge]);

  const mortgage = mortgages.length > 0 ? mortgages[0] : { amount: 0 };
  const netWealth = summary.totalValue - (mortgage.amount || 0);

  const total = summary.totalValue || 1;
  const contribPct = (summary.contributed / total) * 100;
  const otherPct = (summary.other / total) * 100;

  const accessiblePct = (summary.accessible / total) * 100;
  const lockedPct = (summary.locked / total) * 100;

  const accessibleTotal = summary.accessibleBreakdown.cash + summary.accessibleBreakdown.isa + summary.accessibleBreakdown.lisa || 1;
  const cashPct = (summary.accessibleBreakdown.cash / accessibleTotal) * 100;
  const isaPct = (summary.accessibleBreakdown.isa / accessibleTotal) * 100;
  const lisaPct = (summary.accessibleBreakdown.lisa / accessibleTotal) * 100;

  // Pie chart 1: Composition (Contributed vs Other)
  const compositionChart = (
    <svg viewBox="0 0 32 32" style={{ width: '60px', height: '60px', flexShrink: 0 }}>
      <circle r="16" cx="16" cy="16" style={{ fill: '#ddebfa' }} />
      <circle r="16" cx="16" cy="16" style={{ fill: '#24594f', strokeWidth: 32, strokeDasharray: `${contribPct} 100`, strokeDashoffset: 0 }} />
      <circle r="16" cx="16" cy="16" style={{ fill: 'transparent', stroke: '#e67e22', strokeWidth: 32, strokeDasharray: `${otherPct} 100`, strokeDashoffset: -contribPct }} />
    </svg>
  );

  //Pie chart 2: Liquidity (Accessible vs Locked)
  // const liquidityChart = (
  //   <svg viewBox="0 0 32 32" style={{ width: '60px', height: '60px', flexShrink: 0 }}>
  //     <circle r="16" cx="16" cy="16" style={{ fill: '#ddebfa' }} />
  //     <circle r="16" cx="16" cy="16" style={{ fill: '#27ae60', strokeWidth: 32, strokeDasharray: `${accessiblePct} 100`, strokeDashoffset: 0 }} />
  //     <circle r="16" cx="16" cy="16" style={{ fill: 'transparent', stroke: '#c0392b', strokeWidth: 32, strokeDasharray: `${lockedPct} 100`, strokeDashoffset: -accessiblePct }} />
  //   </svg>
  // );


// Pie chart 2: Liquidity (Accessible vs Locked)
// Calculate local percentages specifically for this chart using a local total
const localLiquidityTotal = summary.accessible + summary.locked;
const chartAccessiblePct = (summary.accessible / localLiquidityTotal) * 100;
const chartLockedPct = (summary.locked / localLiquidityTotal) * 100;

// Circumference of r=8 is exactly 50.265 (2 * Math.PI * 8)
const circumference = 50.265;
const accessibleStroke = (chartAccessiblePct / 100) * circumference;
const lockedStroke = (chartLockedPct / 100) * circumference;

const liquidityChart = (
  <svg viewBox="0 0 32 32" style={{ width: '60px', height: '60px', flexShrink: 0 }}>
    {/* Accessible Slice (Green) */}
    <circle 
      r="8" 
      cx="16" 
      cy="16" 
      transform="rotate(-90 16 16)"
      style={{ 
        fill: 'transparent', 
        stroke: '#27ae60', 
        strokeWidth: 16, 
        strokeDasharray: `${accessibleStroke} ${circumference}`, 
        strokeDashoffset: 0 
      }} 
    />
    
    {/* Locked Slice (Red) */}
    <circle 
      r="8" 
      cx="16" 
      cy="16" 
      transform="rotate(-90 16 16)"
      style={{ 
        fill: 'transparent', 
        stroke: '#c0392b', 
        strokeWidth: 16, 
        strokeDasharray: `${lockedStroke} ${circumference}`, 
        strokeDashoffset: -accessibleStroke 
      }} 
    />
  </svg>
);

  // Pie chart 3: Accessible Breakdown (Cash vs ISA vs LISA)
  const accessibleBreakdownChart = (
    <svg viewBox="0 0 32 32" style={{ width: '60px', height: '60px', flexShrink: 0 }}>
      <circle r="16" cx="16" cy="16" style={{ fill: '#ddebfa' }} />
      <circle r="16" cx="16" cy="16" style={{ fill: '#3498db', strokeWidth: 32, strokeDasharray: `${cashPct} 100`, strokeDashoffset: 0 }} />
      <circle r="16" cx="16" cy="16" style={{ fill: 'transparent', stroke: '#9b59b6', strokeWidth: 32, strokeDasharray: `${isaPct} 100`, strokeDashoffset: -cashPct }} />
      <circle r="16" cx="16" cy="16" style={{ fill: 'transparent', stroke: '#f1c40f', strokeWidth: 32, strokeDasharray: `${lisaPct} 100`, strokeDashoffset: -(cashPct + isaPct) }} />
    </svg>
  );

  // Pie chart for Net Wealth (Total Assets vs Mortgage Debt)
  const netWealthChart = (
    <svg viewBox="0 0 32 32" style={{ width: '60px', height: '60px', flexShrink: 0, borderRadius: '50%' }}>
      {/* Background circle */}
      <circle r="16" cx="16" cy="16" style={{ fill: '#ddebfa' }} /> 
      
      {/* Calculate parts of the pie based on absolute values */}
      {(() => {
        // summary.totalValue now includes assetsTotal
        const total = Math.abs(summary.totalValue) + Math.abs(mortgage.amount);
        if (total === 0) return null;
        
        const assetPct = (Math.abs(summary.totalValue) / total) * 100;
        const debtPct = (Math.abs(mortgage.amount) / total) * 100;
        
        return (
          <>
            {/* Green slice for Total Assets (Savings + Large Assets) */}
            {summary.totalValue > 0 && (
              <circle 
                r="16" cx="16" cy="16" 
                style={{ 
                  fill: '#27ae60',
                  strokeWidth: 32, 
                  strokeDasharray: `${assetPct} 100`, 
                  strokeDashoffset: 0 
                }} 
              />
            )}
            {/* Red slice for Debt */}
            {mortgage.amount > 0 && (
              <circle 
                r="16" cx="16" cy="16" 
                style={{ 
                  fill: 'transparent', 
                  stroke: '#c0392b',
                  strokeWidth: 32, 
                  strokeDasharray: `${debtPct} 100`, 
                  strokeDashoffset: -assetPct 
                }} 
              />
            )}
          </>
        );
      })()}
    </svg>
  );

  return (
    <section className="panel span-12" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        <h2>Net Wealth</h2>
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          {netWealthChart}
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", justifyContent: "flex-start", gap: "10px", alignItems: "center", paddingBottom: "10px", marginBottom: "10px", borderBottom: "1px solid #eee" }}>
              <span>Net Wealth</span>
              <strong>{money.format(netWealth)}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-start", gap: "10px", fontSize: "0.85rem", color: "#24594f" }}>
              <span>Total Assets: </span>
              {/* <span>Total Assets (Savings: {money.format(summary.totalValue - summary.assetsTotal)} + Assets: {money.format(summary.assetsTotal)})</span> */}
              <strong>{money.format(summary.totalValue)}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-start", gap: "10px", fontSize: "0.85rem", color: "#c0392b" }}>
              <span>Mortgage Debt</span>
              <strong>{money.format(mortgage.amount)}</strong>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        <h2>Accessible Funds</h2>
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          {accessibleBreakdownChart}
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", color: "#3498db" }}>
              <span>Cash</span>
              <strong>{money.format(summary.accessibleBreakdown.cash)}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", color: "#9b59b6" }}>
              <span>ISA</span>
              <strong>{money.format(summary.accessibleBreakdown.isa)}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", color: "#f1c40f" }}>
              <span>LISA</span>
              <strong>{money.format(summary.accessibleBreakdown.lisa)}</strong>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        <h2>Asset Composition</h2>
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          {compositionChart}
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", color: "#24594f" }}>
              <span>Capital Contributed</span>
              <strong>{money.format(summary.contributed)}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", color: "#e67e22" }}>
              <span>Market Growth</span>
              <strong>{money.format(summary.other)}</strong>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        <h2>Liquidity</h2>
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          {liquidityChart}
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", color: "#27ae60" }}>
              <span>Accessible</span>
              <strong>{money.format(summary.accessible)}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", color: "#c0392b" }}>
              <span>Locked</span>
              <strong>{money.format(summary.locked)}</strong>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function SavingsSection({
  savings, setSavings, projectionYears, setProjectionYears, projectedSavings, projectedTotal, allProjectedTotal,
  employmentPensionMonthly, employerPensionMonthly, nhsJobsGross, civilServiceJobsGross, teachersJobsGross,
  drawdownSettings, birthYear, mortgages, assets, currentAge
}: any) {
  const refs = useMemo(() => savings.reduce((acc: any, b: any) => ({ ...acc, [b.id]: React.createRef<HTMLDivElement>() }), {}), [savings]);
  
  const handleExportCSV = () => {
    const csv = generateSavingsCSV(savings);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `finance_statement_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  return (
    <div className="workspace">
      <WealthSummaryCard savings={savings} mortgages={mortgages} assets={assets} currentAge={currentAge} />
      <section className="panel span-12">
        <div className="split-title" style={{ flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'flex-start' : 'center', gap: '12px' }}>
          <h2>Savings Manager</h2>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: 'wrap' }}>
            <button className="secondary" onClick={handleExportCSV} style={{ fontSize: '0.75rem', height: '32px' }}>Download CSV Statement</button>
            <span style={{ fontSize: "0.9rem", color: "#666", whiteSpace: 'nowrap' }}>Projection Period:</span>
            <div style={{ width: "100px" }}>
              <NumberInput placeholder="10" value={parseFloat(projectionYears.toFixed(2))} onChange={setProjectionYears} suffix="yrs" />
            </div>
          </div>
        </div>
        <details className="disclosure-section" style={{ marginBottom: "16px", border: "1px solid #e7e0d5", borderRadius: "8px" }}><summary style={{ padding: "16px", background: "#fcfaf6", cursor: "pointer", fontWeight: 600 }}>Manage Individual Savings</summary><div style={{ padding: "16px" }}>{savings.map((bucket: SavingsBucket) => (
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
                  <div><label>Balance</label><NumberInput placeholder="0" value={parseFloat(bucket.balance.toFixed(2))} onChange={(balance: number) => setSavings(updateItem(savings, bucket.id, { balance: parseFloat(balance.toFixed(2)) } as Partial<SavingsBucket>))} /></div>
                  <div><label>Total Contributed</label><NumberInput placeholder="0" value={parseFloat((bucket.totalContributed || 0).toFixed(2))} onChange={(totalContributed: number) => setSavings(updateItem(savings, bucket.id, { totalContributed: parseFloat(totalContributed.toFixed(2)) } as Partial<SavingsBucket>))} /></div>
                  <div><label>Last Updated</label><input type="date" value={bucket.lastUpdated || ""} onChange={(e) => setSavings(updateItem(savings, bucket.id, { lastUpdated: e.target.value } as Partial<SavingsBucket>))} /></div>
                  <div><label>Monthly</label><NumberInput placeholder="0" value={parseFloat(bucket.monthly.toFixed(2))} onChange={(monthly: number) => setSavings(updateItem(savings, bucket.id, { monthly: parseFloat(monthly.toFixed(2)) } as Partial<SavingsBucket>))} /></div>
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
function MortgageSection({ mortgages, setMortgages, mortgageSummaries }: { mortgages: MortgageInputs[]; setMortgages: React.Dispatch<React.SetStateAction<MortgageInputs[]>>; mortgageSummaries: any[] }) {
  const addMortgage = () => setMortgages([...mortgages, { amount: 0, annualRate: 4, years: 25, monthlyOverpayment: 0, oneOffMonth: 0, oneOffAmount: 0, paymentDay: 1 }]);
  const updateMortgage = (index: number, patch: Partial<MortgageInputs>) => {
    setMortgages(mortgages.map((m, i) => (i === index ? { ...m, ...patch } : m)));
  };
  const removeMortgage = (index: number) => setMortgages(mortgages.filter((_, i) => i !== index));

  if (mortgages.length === 0) {
    return (
      <div className="workspace">
        <section className="panel span-12" style={{ textAlign: 'center', padding: '40px' }}>
          <h2>No Mortgage Accounts</h2>
          <p>You haven't added any mortgage accounts yet.</p>
          <button className="primary" onClick={addMortgage}>+ Add First Mortgage</button>
        </section>
      </div>
    );
  }

  return (
    <div className="workspace">
      {mortgages.map((mortgage, i) => (
        <section key={i} className="panel span-12 mortgage-panel">
          <div className="split-title">
            <h2>Mortgage {i + 1}</h2>
            <button className="secondary danger" onClick={() => removeMortgage(i)}>Remove</button>
          </div>
          <div className="mortgage-grid">
            <label>Mortgage amount <NumberInput placeholder="0" value={mortgage.amount} onChange={(amount) => updateMortgage(i, { amount })} /></label>
            <label>Annual rate % <NumberInput placeholder="0" value={mortgage.annualRate} onChange={(annualRate) => updateMortgage(i, { annualRate })} /></label>
            <label>Term years <NumberInput placeholder="0" value={mortgage.years} onChange={(years) => updateMortgage(i, { years })} max={120} /></label>
            <label>Monthly overpayment <NumberInput placeholder="0" value={mortgage.monthlyOverpayment} onChange={(monthlyOverpayment) => updateMortgage(i, { monthlyOverpayment })} /></label>
            <label>One-off month <NumberInput placeholder="0" value={mortgage.oneOffMonth} onChange={(oneOffMonth) => updateMortgage(i, { oneOffMonth })} /></label>
            <label>One-off amount <NumberInput placeholder="0" value={mortgage.oneOffAmount} onChange={(oneOffAmount) => updateMortgage(i, { oneOffAmount })} /></label>
            <label>
              Payment day of month
              <input
                type="number"
                min={1}
                max={28}
                value={mortgage.paymentDay ?? 1}
                onChange={(e) => updateMortgage(i, { paymentDay: Math.min(28, Math.max(1, parseInt(e.target.value) || 1)) })}
                style={{ marginTop: '4px' }}
                title="Day of the month your mortgage payment leaves your account (1–28)"
              />
            </label>
            <label>Last updated <input type="date" value={mortgage.lastUpdated || ""} onChange={(e) => updateMortgage(i, { lastUpdated: e.target.value })} style={{ marginTop: '4px' }} /></label>
          </div>
          {mortgageSummaries[i] && (
            <section className="summary-grid tight">
              <Metric label="Standard payment" value={monthlyMoney.format(mortgageSummaries[i].standardPayment)} />
              <Metric label="Payoff time" value={`${mortgageSummaries[i].payoffYears.toFixed(1)} years`} />
              <Metric label="Interest paid" value={money.format(mortgageSummaries[i].totalInterest)} tone="amber" />
              <Metric label="Interest saved" value={money.format(mortgageSummaries[i].interestSaved)} tone="green" />
            </section>
          )}
        </section>
      ))}
      <div className="span-12">
        <button 
          className="primary" 
          onClick={addMortgage} 
          style={{ 
            width: '100%', 
            padding: '16px 8px', 
            fontSize: '0.95rem', 
            whiteSpace: 'normal', 
            lineHeight: '1.2',
            textAlign: 'center',
            marginBottom: '20px'
          }}
        >
          + Add Mortgage Account
        </button>
      </div>
    </div>
  );
}

function DepletionChart({ simulation }: { simulation: RetirementSimulationResult }) { 
  const colors = ['#2c7363', '#805ad5', '#d53f8c', '#4a5568']; 
  const startAge = simulation.rows[0]?.age || 0;
  const years = simulation.rows
    .filter((row, idx) => idx === 0 || row.age === simulation.firstShortfallAge || row.age === simulation.finalAge || (row.age - startAge) % 5 === 0)
    .map(row => row.age - startAge);

  const data = useMemo(() => {
    return simulation.rows
      .filter((row) => years.includes(row.age - startAge))
      .map(row => ({
        year: row.age - startAge,
        age: row.age,
        buckets: [
          { label: 'ISA + Cash', value: Math.max(0, row.accessiblePot) },
          { label: 'LISA', value: Math.max(0, row.lisaPot) },
          { label: 'Pension', value: Math.max(0, row.pensionPot) },
          { label: 'Total Pot', value: Math.max(0, row.totalPot) },
        ],
      }));
  }, [simulation, startAge, years.join(',')]);

  if (!data || data.length === 0 || !data[0]?.buckets) return null; 
  if (data[0].buckets.length === 0) return null; 
  return (
    <div className='depletion-chart' style={{ marginTop: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <h3 style={{ margin: 0 }}>Pot Depletion Projection</h3>
        <span 
          className="tooltip-trigger" 
          data-tooltip={`This chart now uses the same year-by-year retirement simulation as the funding analysis. It deducts actual required spending, taxes pension withdrawals, applies other income as it starts, and tracks the first shortfall age.`}
        >
          ⓘ
        </span>
      </div>
      <div style={{ marginBottom: '16px', fontSize: '0.8rem', color: '#666', fontStyle: 'italic' }}>
        {simulation.firstShortfallAge === null
          ? `No simulated shortfall through age ${simulation.finalAge}.`
          : `First simulated shortfall at age ${simulation.firstShortfallAge}.`}
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

  const [hoveredData, setHoveredData] = useState<any>(null);
  const [hoveredCoords, setHoveredCoords] = useState<{ x: number, y: number } | null>(null);

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = e.currentTarget;
    const CTM = svg.getScreenCTM();
    if (!CTM) return;
    const svgPoint = svg.createSVGPoint();
    svgPoint.x = e.clientX;
    svgPoint.y = e.clientY;
    const transformedPoint = svgPoint.matrixTransform(CTM.inverse());

    // Find the closest year based on x position
    const closestYearIndex = years.reduce((prev: number, curr: number, index: number) => {
      const xPos = getX(curr);
      return Math.abs(xPos - transformedPoint.x) < Math.abs(getX(years[prev]) - transformedPoint.x) ? index : prev;
    }, 0);

    const yearData = data[closestYearIndex];
    if (yearData) {
      setHoveredData(yearData);
      setHoveredCoords({ x: transformedPoint.x, y: transformedPoint.y });
    }
  };

  const handleMouseLeave = () => {
    setHoveredData(null);
    setHoveredCoords(null);
  };

  return (
    <div className='line-chart-container' style={{ position: 'relative' }}> {/* Add relative positioning for tooltip */}
      <svg
        viewBox={'0 0 ' + width + ' ' + height}
        style={{ width: '100%', height: 'auto', background: '#fffaf1', borderRadius: '8px', border: '1px solid #e7e0d5' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke='#ccc' strokeWidth='1' />
        <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke='#ccc' strokeWidth='1' />
        {[0, 0.25, 0.5, 0.75, 1].map(p => (
          <g key={p}>
            <line x1={padding} y1={getY(maxVal * p)} x2={width - padding} y2={getY(maxVal * p)} stroke='#f0ece4' strokeDasharray='4' />
            <text x={padding - 10} y={getY(maxVal * p) + 4} textAnchor='end' fontSize='11' fill='#888'>{money.format(maxVal * p)}</text>
          </g>
        ))}
        
        {/* {data.map((d: any) => (
          <g key={d.year}>
            <text x={getX(d.year)} y={height - padding + 20} textAnchor='middle' fontSize='11' fill='#888'>{'+' + d.year + 'y'}</text>
            <text x={getX(d.year)} y={height - padding + 35} textAnchor='middle' fontSize='10' fill='#aaa'>{'Age ' + d.age}</text>
          </g>
        ))} */}
        {data.map((d: any, index: number) => {
          const isFirstYear = index === 0;
          const isLastYear = index === data.length - 1;
          const isEveryFifthYear = d.year % 5 === 0;

          // Define a threshold (e.g., 2 years) to prevent crowding near the end
          const lastYear = data[data.length - 1].year;
          const isTooCloseToLastYear = !isLastYear && (lastYear - d.year) <= 2;

          // Decide if we should render this label
          let shouldRender = false;
          if (isFirstYear || isLastYear) {
            shouldRender = true;
          } else if (isEveryFifthYear && !isTooCloseToLastYear) {
            shouldRender = true;
          }

          if (!shouldRender) {
            return null;
          }

          return (
            <g key={d.year}>
              <line 
                x1={getX(d.year)} 
                y1={height - padding} 
                x2={getX(d.year)} 
                y2={height - padding + 5} 
                stroke='#ccc' 
              />
              <text 
                x={getX(d.year)} 
                y={height - padding + 20} 
                textAnchor='middle' 
                fontSize='11' 
                fill={isLastYear ? '#ef4444' : '#888'} // Highlight final year in red
                fontWeight={isLastYear ? 'bold' : 'normal'}
              >
                {'+' + d.year + 'y'}
              </text>
              <text 
                x={getX(d.year)} 
                y={height - padding + 35} 
                textAnchor='middle' 
                fontSize='10' 
                fill={isLastYear ? '#ef4444' : '#aaa'}
                fontWeight={isLastYear ? 'bold' : 'normal'}
              >
                {'Age ' + Math.round(d.age)}
              </text>
            </g>
          );
        })}

        {bucketNames.map((name: string, i: number) => {
          const points = data.map((d: any) => {
            const bucket = d.buckets.find((b: any) => b.label === name);
            return getX(d.year) + ',' + getY(bucket.value);
          }).join(' ');
          return (
            <polyline key={name} fill='none' stroke={colors[i % colors.length]} strokeWidth='3' strokeLinejoin='round' strokeLinecap='round' points={points} />
          );
        })}

        {hoveredData && (
          // Render a vertical line at the hovered X position
          <line
            x1={getX(hoveredData.year)}
            y1={padding}
            x2={getX(hoveredData.year)}
            y2={height - padding}
            stroke='#888'
            strokeDasharray='3 3'
            strokeWidth='1'
          />
        )}
      </svg>

      {hoveredData && hoveredCoords && (
        <div
          className='chart-tooltip'
          style={{
            position: 'absolute',
            left: hoveredCoords.x + 10, // Offset from mouse
            top: hoveredCoords.y - 10,  // Offset from mouse
            background: 'white',
            border: '1px solid #ccc',
            padding: '8px',
            borderRadius: '4px',
            pointerEvents: 'none', // Allow mouse events to pass through
            zIndex: 1000,
            fontSize: '0.75rem',
            boxShadow: '0 2px 5px rgba(0,0,0,0.2)'
          }}
        >
          <div><strong>Year:</strong> {hoveredData.year} (+{hoveredData.year}y)</div>
          <div><strong>Age:</strong> {hoveredData.age.toFixed(1)}</div>
          {hoveredData.buckets.map((b: any) => (
            <div key={b.label}><strong>{b.label}:</strong> {money.format(b.value)}</div>
          ))}
        </div>
      )}

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

function MonteCarloChart({ result }: { result: MonteCarloResult }) {
  const width = 800;
  const height = 350;
  const padding = 80;

  const ages = result.ages;
  const pessimistic = result.pessimisticPath;
  const median = result.medianPath;
  const optimistic = result.optimisticPath;

  const maxVal = Math.max(
    10000,
    ...optimistic,
    ...median,
    ...pessimistic
  );

  const getX = (age: number) => {
    if (ages.length <= 1) return padding;
    const fraction = (age - ages[0]) / (ages[ages.length - 1] - ages[0]);
    return padding + fraction * (width - 2 * padding);
  };

  const getY = (val: number) => {
    return height - padding - (val / maxVal) * (height - 2 * padding);
  };

  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [hoverCoords, setHoverCoords] = useState<{ x: number; y: number } | null>(null);

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = e.currentTarget;
    const CTM = svg.getScreenCTM();
    if (!CTM) return;
    const svgPoint = svg.createSVGPoint();
    svgPoint.x = e.clientX;
    svgPoint.y = e.clientY;
    const transformedPoint = svgPoint.matrixTransform(CTM.inverse());

    const closestIdx = ages.reduce((prev, currAge, index) => {
      const xPos = getX(currAge);
      const prevXPos = getX(ages[prev]);
      return Math.abs(xPos - transformedPoint.x) < Math.abs(prevXPos - transformedPoint.x) ? index : prev;
    }, 0);

    setHoverIdx(closestIdx);
    setHoverCoords({ x: transformedPoint.x, y: transformedPoint.y });
  };

  const handleMouseLeave = () => {
    setHoverIdx(null);
    setHoverCoords(null);
  };

  const pessimisticPoints = ages.map((age, idx) => getX(age) + ',' + getY(pessimistic[idx])).join(' ');
  const medianPoints = ages.map((age, idx) => getX(age) + ',' + getY(median[idx])).join(' ');
  const optimisticPoints = ages.map((age, idx) => getX(age) + ',' + getY(optimistic[idx])).join(' ');

  return (
    <div style={{ position: 'relative' }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: '100%', height: 'auto', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {[0, 0.25, 0.5, 0.75, 1].map(p => (
          <g key={p}>
            <line x1={padding} y1={getY(maxVal * p)} x2={width - padding} y2={getY(maxVal * p)} stroke='#e2e8f0' strokeDasharray='4' />
            <text x={padding - 10} y={getY(maxVal * p) + 4} textAnchor='end' fontSize='11' fill='#64748b'>{money.format(maxVal * p)}</text>
          </g>
        ))}

        {ages.filter((_, idx) => idx === 0 || idx === ages.length - 1 || idx % 5 === 0).map(age => (
          <g key={age}>
            <line x1={getX(age)} y1={height - padding} x2={getX(age)} y2={height - padding + 5} stroke='#cbd5e1' />
            <text x={getX(age)} y={height - padding + 20} textAnchor='middle' fontSize='11' fill='#64748b'>Age {age}</text>
          </g>
        ))}

        <polyline fill='none' stroke='#ef4444' strokeWidth='2' strokeDasharray='4 2' points={pessimisticPoints} />
        <polyline fill='none' stroke='#3b82f6' strokeWidth='3' points={medianPoints} />
        <polyline fill='none' stroke='#10b981' strokeWidth='2' strokeDasharray='4 2' points={optimisticPoints} />

        {hoverIdx !== null && (
          <line
            x1={getX(ages[hoverIdx])}
            y1={padding}
            x2={getX(ages[hoverIdx])}
            y2={height - padding}
            stroke='#94a3b8'
            strokeDasharray='3 3'
            strokeWidth='1'
          />
        )}
      </svg>

      {hoverIdx !== null && hoverCoords && (
        <div
          style={{
            position: 'absolute',
            left: hoverCoords.x + 15,
            top: hoverCoords.y - 15,
            background: 'white',
            border: '1px solid #cbd5e1',
            padding: '10px',
            borderRadius: '6px',
            pointerEvents: 'none',
            zIndex: 1000,
            fontSize: '0.75rem',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
            lineHeight: '1.4'
          }}
        >
          <div style={{ fontWeight: 700, color: '#1e293b', marginBottom: '4px' }}>Age {ages[hoverIdx]}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#10b981' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }} />
            <strong>Optimistic (90th %):</strong> {money.format(optimistic[hoverIdx])}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#3b82f6' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#3b82f6' }} />
            <strong>Median (50th %):</strong> {money.format(median[hoverIdx])}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#ef4444' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444' }} />
            <strong>Pessimistic (10th %):</strong> {money.format(pessimistic[hoverIdx])}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', marginTop: '14px', justifyContent: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ width: '20px', height: '3px', background: '#10b981', borderTop: '2px dashed #10b981' }} />
          <small style={{ fontWeight: 600, color: '#475569' }}>Optimistic (Top 10% market outcomes)</small>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ width: '20px', height: '3px', background: '#3b82f6' }} />
          <small style={{ fontWeight: 600, color: '#475569' }}>Median (Typical market outcomes)</small>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ width: '20px', height: '3px', background: '#ef4444', borderTop: '2px dashed #ef4444' }} />
          <small style={{ fontWeight: 600, color: '#475569' }}>Pessimistic (Bottom 10% market outcomes)</small>
        </div>
      </div>
    </div>
  );
}
