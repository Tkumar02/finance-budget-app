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
  calculateMortgage,
  calculateTaxSummary,
  money,
  monthlyMoney,
  projectSavings,
  requiredGrossForNet,
  calculateNhsEmployeeRate,
  NHS_EMPLOYER_RATE,
} from "./calculations";
import "./styles.css";

type SectionId = "overview" | "income" | "tax" | "budget" | "savings" | "mortgage" | "retirement" | "profile";

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
    otherRetirementIncome: ExpenseLine[];
    drawdownRate: number;
    drawdownSettings: Record<string, { enabled: boolean; rate: number }>;
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
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label>
            Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
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
  const [otherRetirementIncome, setOtherRetirementIncome] = useState<ExpenseLine[]>([]);
  const [drawdownSettings, setDrawdownSettings] = useState<Record<string, { enabled: boolean; rate: number }>>({});

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
    };

    if (currentPlanId) {
      const planRef = doc(db, "plans", currentPlanId);
      await updateDoc(planRef, {
        data: planData,
        updatedAt: serverTimestamp(),
      });
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
      fetchPlans();
      alert("New plan created and saved!");
    }
  };

  const createNewPlan = () => {
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

  const tax = useMemo(
    () => calculateTaxSummary(paye, selfEmployment, taxSettings),
    [paye, selfEmployment, taxSettings],
  );
  const savingsForBudget = useMemo(
    () => savings.filter((bucket) => bucket.type !== "workplace-pension" && !bucket.isHidden),
    [savings],
  );

  const totalSippNet = useMemo(() => {
  return savings
    .filter(s => s.type === 'pension' || s.type === 'lisa') // Add types as needed
    .reduce((sum, s) => sum + (s.monthly * 12), 0);
}, [savings]);

const projectionBuckets = useMemo(() => {
    // 1. Separate standard and NHS contributions
    const standardEmployerMonthly = paye.filter(j => (j.pensionType || 'standard') === 'standard').reduce((sum, job) => {
      const monthly = (job.gross * (job.employerPensionContribution || 0)) / 1200;
      return sum + monthly;
    }, 0);

    const nhsEmployerMonthly = paye.filter(j => j.pensionType === 'nhs').reduce((sum, job) => {
      const monthly = (job.gross * (job.employerPensionContribution || 0)) / 1200;
      return sum + monthly;
    }, 0);

    const standardEmployeeMonthly = paye.filter(j => (j.pensionType || 'standard') === 'standard').reduce((sum, job) => {
      return sum + (job.gross * (job.pensionRate || 0)) / 1200;
    }, 0);

    const nhsEmployeeMonthly = paye.filter(j => j.pensionType === 'nhs').reduce((sum, job) => {
      return sum + (job.gross * (job.pensionRate || 0)) / 1200;
    }, 0);

    return savings.map((bucket) => {
      if (bucket.type === "workplace-pension") {
        return { 
          ...bucket, 
          monthly: bucket.monthly + standardEmployeeMonthly + standardEmployerMonthly
        };
      }
      // NHS Pension is Defined Benefit; contributions don't build a 'pot balance'
      return bucket;
    });
  }, [savings, paye]);
  const budget = useMemo(
    () => budgetSummary(tax.monthlyNet, budgetLines, annualBills, savingsForBudget),
    [tax.monthlyNet, budgetLines, annualBills, savingsForBudget],
  );
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
    if (type === 'pension' || type === 'workplace-pension') return age >= pensionAccessAge;
    if (type === 'nhs-pension') return age >= 67; // Assuming 67 for now
    return true;
  };

  const nhsJobsGross = useMemo(() => {
    return paye.filter(j => j.pensionType === 'nhs').reduce((sum, j) => sum + j.gross, 0);
  }, [paye]);

  const retirementSummary = useMemo(() => {
    // 1. Calculate the total monthly income from enabled pots using their specific rates
    const monthlyDrawdownFromEnabledPots = projectedSavings.reduce((sum, bucket) => {
      const settings = drawdownSettings[bucket.id] || { enabled: true, rate: 4 };
      if (!settings.enabled) return sum;

      if (bucket.type === 'nhs-pension') {
        if (!isBucketAccessible(bucket.type, retirementAge)) return sum;
        const salary = nhsJobsGross || bucket.nhsSalary || 0;
        const yearsAtRetirement = (bucket.nhsYearsService || 0) + projectionYears;
        const accrual = bucket.nhsScheme === "1995" ? 80 : bucket.nhsScheme === "2008" ? 60 : 54;
        const annualNHSIncome = (salary / accrual) * yearsAtRetirement;
        return sum + (annualNHSIncome / 12);
      }

      let val = bucket.projected;
      
      // 1. Calculate the 25% penalty if it's an early LISA withdrawal
      if (bucket.type === 'lisa' && retirementAge < 60) {
        val = val * 0.75;
      }

      // 2. Only block the pot if it's NOT a LISA and it's currently inaccessible
      if (bucket.type !== 'lisa' && !isBucketAccessible(bucket.type, retirementAge)) {
        return sum;
      }

      // Calculate annual drawdown for this specific pot
      const annualDrawdown = val * (settings.rate / 100);
      return sum + (annualDrawdown / 12);
    }, 0);

    const monthlyOther = otherRetirementIncome.reduce((s, i) => s + i.amount, 0);
    const totalMonthlyIn = monthlyDrawdownFromEnabledPots + monthlyOther;

    return {
      monthlyIn: totalMonthlyIn,
      surplus: totalMonthlyIn - expectedOutgoings
    };
  }, [projectedSavings, retirementAge, otherRetirementIncome, expectedOutgoings, drawdownSettings, pensionAccessAge]);


  
  const sections = [
    { id: "overview", title: "Overview", value: monthlyMoney.format(budget.monthlySurplus), detail: "monthly surplus" },
    { id: "income", title: "Income", value: money.format(tax.payeGross + tax.selfProfit), detail: "gross + profit" },
    { id: "tax", title: "Tax", value: monthlyMoney.format(tax.selfAssessmentDue / 12), detail: "monthly set-aside" },
    { id: "budget", title: "Budget", value: monthlyMoney.format(budget.monthlyOut), detail: "monthly outflow" },
    { id: "savings", title: "Savings", value: money.format(projectedTotal), detail: `${projectionYears} year projection` },
    { id: "mortgage", title: "Mortgage", value: `${mortgageSummary.payoffYears.toFixed(1)} yrs`, detail: "payoff estimate" },
    { id: "retirement", title: "Retirement", value: monthlyMoney.format(retirementSummary.monthlyIn), detail: "post-work income" },
    { id: "profile", title: "Profile", value: `${birthYear}/${birthMonth}`, detail: "personal details" },
  ] satisfies { id: SectionId; title: string; value: string; detail: string }[];

  if (authLoading) return <div className="loading-screen">Loading application...</div>;
  if (!user) return <AuthScreen />;

  return (
    <main className="app-shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">2026-2027 UK planning estimator</p>
          <h1>Income Plan</h1>
        </div>
        <div className="plan-actions">
          <div className="plan-selector">
            <select
              value={currentPlanId || ""}
              onChange={(e) => {
                const plan = plans.find((p) => p.id === e.target.value);
                if (plan) loadPlan(plan);
              }}
            >
              <option value="" disabled>Select a plan...</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <button className="secondary" onClick={createNewPlan}>New Plan</button>
            <button onClick={handleSavePlan}>Save Plan</button>
            {currentPlanId && <button className="secondary" style={{ color: "#a7332f" }} onClick={handleDeletePlan}>Delete</button>}
          </div>
          <button className="secondary" onClick={() => signOut(auth)}>Sign Out ({user.email})</button>
        </div>
      </section>

      <section className="summary-grid">
        <Metric label="Annual net estimate" value={money.format(tax.netAnnual)} tone="green" />
        <Metric label="Monthly net estimate" value={monthlyMoney.format(tax.monthlyNet)} />
        <Metric label="Monthly expenses" value={monthlyMoney.format(budget.monthlyExpenses)} tone="amber" />
        <Metric label="Monthly savings" value={monthlyMoney.format(budget.monthlySavings)} tone="green" />
      </section>

      <nav className="section-cards" aria-label="Finance sections">
        {sections.map((section) => (
          <button
            className={activeSection === section.id ? "section-card active" : "section-card"}
            key={section.id}
            onClick={() => setActiveSection(section.id)}
          >
            <span>{section.title}</span>
            <strong>{section.value}</strong>
            <small>{section.detail}</small>
          </button>
        ))}
      </nav>

      {activeSection === "overview" ? (
        <OverviewSection
          budget={budget}
          tax={tax}
          targetGross={targetGross}
          sippNetContribution={totalSippNet}
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

      {activeSection === "tax" ? (
        <TaxSection tax={tax} taxSettings={taxSettings} setTaxSettings={setTaxSettings} />
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
        />
      ) : null}

      {activeSection === "mortgage" ? (
        <MortgageSection mortgage={mortgage} setMortgage={setMortgage} mortgageSummary={mortgageSummary} />
      ) : null}

      {activeSection === "retirement" ? (
        <RetirementSection
          birthYear={birthYear} setBirthYear={setBirthYear}
          retirementAge={retirementAge} 
          setRetirementAge={(targetAge: number) => setProjectionYears(Math.max(0, targetAge - currentAge))}
          outgoings={expectedOutgoings} setOutgoings={setExpectedOutgoings}
          otherIncome={otherRetirementIncome} setOtherIncome={setOtherRetirementIncome}
          summary={retirementSummary}
          projectedSavings={projectedSavings}
          drawdownSettings={drawdownSettings}
          setDrawdownSettings={setDrawdownSettings}
          isBucketAccessible={isBucketAccessible}
          pensionAccessAge={pensionAccessAge}
          projectionYears={projectionYears}
          setProjectionYears={setProjectionYears}
        />
      ) : null}

      {activeSection === "profile" ? (
        <ProfileSection 
          birthYear={birthYear} setBirthYear={setBirthYear} 
          birthMonth={birthMonth} setBirthMonth={setBirthMonth} 
        />
      ) : null}
    </main>
  );
}

function ProfileSection({ birthYear, setBirthYear, birthMonth, setBirthMonth }: any) {
  return (
    <section className="panel span-12">
      <h2>Profile</h2>
      <div className="settings-grid">
        <label>Birth Year <input type="number" value={birthYear} onChange={e => setBirthYear(Number(e.target.value))} /></label>
        <label>Birth Month (1-12) <input type="number" min="1" max="12" value={birthMonth} onChange={e => setBirthMonth(Number(e.target.value))} /></label>
      </div>
    </section>
  );
}

function RetirementSection({ birthYear, setBirthYear, retirementAge, setRetirementAge, outgoings, setOutgoings, otherIncome, setOtherIncome, drawdownRate, setDrawdownRate, summary, projectedSavings, drawdownSettings, setDrawdownSettings, isBucketAccessible, pensionAccessAge, projectionYears, setProjectionYears }: any) {
  const hasLisa = projectedSavings.some((b: any) => b.type === 'lisa');
  return (
    <div className="workspace">
      <section className="panel span-12">
        <h2>Retirement Settings</h2>
        <div className="settings-grid">
          <label>Target Retirement Age <input type="number" value={Math.round(retirementAge)} onChange={e => setRetirementAge(Number(e.target.value))} /></label>
          <label>Expected Monthly Costs <NumberInput value={outgoings} onChange={setOutgoings} /></label>
        </div>
      </section>

      <section className="panel span-12">
        <h2>Drawdown Strategy</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '0.9rem', color: '#666' }}>Projection Period:</span>
            <div style={{ width: '100px' }}>
              <NumberInput value={projectionYears} onChange={setProjectionYears} suffix="yrs" />
            </div>
          </div>
        
        <div className="table retirement-table">
          <div className="table-row header">
            <span>Include</span>
            <span>Pot</span>
            <span>Drawdown %</span>
          </div>
          {projectedSavings.map((bucket: any) => {
            const accessible = isBucketAccessible(bucket.type, retirementAge);
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
                  <div className="mobile-label">Rate %</div>
                  {bucket.type === 'nhs-pension' ? (
                    <span style={{ fontSize: '0.8rem', color: '#2c5282' }}>Defined Benefit (Fixed)</span>
                  ) : (
                    <NumberInput 
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
      </section>

      <section className="panel span-12">
        <PanelHeader 
          title="Other Income Sources" 
          actionLabel="Add Source" 
          onAction={() => setOtherIncome([...otherIncome, {id: uid(), label: "Other Income", amount: 0}])} 
        />
        <div className="budget-lines">
          {otherIncome.map((item: any) => (
            <div key={item.id} className="budget-row">
              <div><div className="mobile-label">Source</div><TextInput value={item.label} onChange={(l) => setOtherIncome(updateItem<ExpenseLine>(otherIncome, item.id, { label: l }))} /></div>
              <div><div className="mobile-label">Amount</div><NumberInput value={item.amount} onChange={(a) => setOtherIncome(updateItem<ExpenseLine>(otherIncome, item.id, { amount: a }))} /></div>
              <button className="delete-btn" onClick={() => setOtherIncome(otherIncome.filter((i: any) => i.id !== item.id))}>×</button>
            </div>
          ))}
        </div>
      </section>

      <section className="panel span-6">
        <h2>Post-Retirement Monthly Income</h2>
        <ResultRows rows={[
          ["Drawdown Income", summary.monthlyIn - otherIncome.reduce((s:any, i:any) => s + i.amount, 0)],
          ["Other Income Sources", otherIncome.reduce((s:any, i:any) => s + i.amount, 0)],
          ["Total Monthly In", summary.monthlyIn],
          ["Monthly Surplus/Deficit", summary.surplus],
        ]} />
        {hasLisa && retirementAge < 60 && (
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
  setActiveSection,
}: {
  budget: ReturnType<typeof budgetSummary>;
  tax: ReturnType<typeof calculateTaxSummary>;
  targetGross: number;
  sippNetContribution: number;
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
  const nhsBucket = savings.find(s => s.type === 'nhs-pension');
  const nhsJobsGross = paye.filter(j => j.pensionType === 'nhs').reduce((sum, j) => sum + j.gross, 0);

  const ensureNhsBucket = () => {
    if (!nhsBucket) {
      setSavings([...savings, { id: uid(), label: "NHS Pension", balance: 0, monthly: 0, annualRate: 0, type: "nhs-pension", nhsScheme: "2015", nhsYearsService: 0 }]);
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
              <div><div className="mobile-label">Source</div><TextInput value={income.label} onChange={(label) => setPaye(updateItem(paye, income.id, { label }))} /></div>
              <div><div className="mobile-label">Gross</div><NumberInput value={income.gross} onChange={(gross) => {
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
                  setPaye(updateItem(paye, income.id, patch));
                }}>
                  <option value="standard">Standard</option>
                  <option value="nhs">NHS</option>
                </select>
              </div>
              <div><div className="mobile-label">Employee Pension %</div><NumberInput value={income.pensionRate} onChange={(pensionRate) => setPaye(updateItem(paye, income.id, { pensionRate }))} suffix="%" /></div>
              <div><div className="mobile-label">Employer Pension</div><NumberInput value={income.employerPensionContribution} onChange={(employerPensionContribution) => setPaye(updateItem(paye, income.id, { employerPensionContribution }))} /></div>
              <div><div className="mobile-label">Tax Paid</div><NumberInput value={income.taxPaid} onChange={(taxPaid) => setPaye(updateItem(paye, income.id, { taxPaid }))} /></div>
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
                <NumberInput value={nhsBucket.nhsYearsService || 0} onChange={(val) => setSavings(updateItem(savings, nhsBucket.id, { nhsYearsService: val }))} />
              </label>
              <label>Pension Scheme
                <select value={nhsBucket.nhsScheme || "2015"} onChange={(e) => setSavings(updateItem(savings, nhsBucket.id, { nhsScheme: e.target.value as any }))}>
                  <option value="1995">1995 Scheme (1/80)</option>
                  <option value="2008">2008 Scheme (1/60)</option>
                  <option value="2015">2015 Scheme (1/54)</option>
                </select>
              </label>
              <div style={{ gridColumn: 'span 2', fontSize: '0.85rem', color: '#4a5568', marginTop: '10px' }}>
                <strong>Projected Annual Income:</strong> The system will use your combined NHS job salary (£{nhsJobsGross.toLocaleString()}) 
                and project it forward until your retirement at age 67.
              </div>
            </div>
          ) : (
            <button onClick={ensureNhsBucket}>Initialize NHS Pension Bucket</button>
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
                  <TextInput value={stream.label} onChange={(label) => setSelfEmployment(updateItem(selfEmployment, stream.id, { label }))} />
                  <button className="delete-btn" onClick={() => setSelfEmployment(selfEmployment.filter((s: any) => s.id !== stream.id))}>×</button>
                </div>
                <label>
                  Gross income
                  <NumberInput value={stream.gross} onChange={(gross) => setSelfEmployment(updateItem(selfEmployment, stream.id, { gross }))} />
                </label>
                <div className="expense-list">
                  {stream.expenses.map((expense) => (
                    <div className="expense-row" key={expense.id}>
                      <TextInput
                        value={expense.label}
                        onChange={(label) => updateExpense(stream.id, expense.id, { label }, selfEmployment, setSelfEmployment)}
                      />
                      <NumberInput
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
                          ? { ...item, expenses: [...item.expenses, { id: uid(), label: "Expense", amount: 0 }] }
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

function TaxSection({
  tax,
  taxSettings,
  setTaxSettings,
}: {
  tax: ReturnType<typeof calculateTaxSummary>;
  taxSettings: TaxSettings;
  setTaxSettings: React.Dispatch<React.SetStateAction<TaxSettings>>;
}) {
  return (
    <div className="workspace">
      <section className="panel span-5">
        <h2>Tax Settings</h2>
        <div className="settings-grid">
          <label>
            Tax code
            <input value={taxSettings.taxCode} onChange={(event) => setTaxSettings({ ...taxSettings, taxCode: event.target.value })} />
          </label>
          <label>
            Region
            <select value={taxSettings.region} onChange={(event) => setTaxSettings({ ...taxSettings, region: event.target.value as TaxSettings["region"] })}>
              <option value="england-wales-ni">England, Wales, NI</option>
              <option value="scotland">Scotland</option>
            </select>
          </label>
          <label>
            Annual SIPP paid by you (net)
            <NumberInput value={taxSettings.sippNetContribution} onChange={(sippNetContribution) => setTaxSettings({ ...taxSettings, sippNetContribution })} />
          </label>
        </div>
        {tax.sippNetNeededToReach100k > 0 ? (
          <div className="callout amber">
            <strong>{money.format(tax.sippGrossNeededToReach100k)} gross</strong>
            <span>
              extra gross SIPP contribution estimated to bring adjusted net income to GBP 100,000. That is about{" "}
              {money.format(tax.sippNetNeededToReach100k)} paid by you if basic-rate relief is added by the provider.
            </span>
          </div>
        ) : null}
      </section>
      <section className="panel span-7">
        <h2>Tax Estimate</h2>
        <ResultRows
          rows={[
            ["PAYE taxable", tax.payeTaxable],
            ["Self-employed profit", tax.selfProfit],
            ["Adjusted net income", tax.combinedTax.adjustedNetIncome],
            ["Personal allowance", tax.combinedTax.allowance],
            ["Total income tax", tax.combinedTax.totalTax],
            ["PAYE tax credited", tax.assumedPayeTaxPaid],
            ["Self assessment due", tax.selfAssessmentDue],
          ]}
        />
        <BandChart bands={tax.combinedTax.bandResults} />
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
  setActiveSection,
}: {
  monthlyNet: number;
  budget: ReturnType<typeof budgetSummary>;
  budgetLines: BudgetLine[];
  setBudgetLines: React.Dispatch<React.SetStateAction<BudgetLine[]>>;
  annualBills: ExpenseLine[];
  setAnnualBills: React.Dispatch<React.SetStateAction<ExpenseLine[]>>;
  savings: SavingsBucket[];
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
              <div><div className="mobile-label">Label</div><TextInput value={line.label} onChange={(label) => setBudgetLines(updateItem(budgetLines, line.id, { label }))} /></div>
              <div><div className="mobile-label">Category</div><select value={line.bucket} onChange={(event) => setBudgetLines(updateItem(budgetLines, line.id, { bucket: event.target.value as BudgetLine["bucket"] }))}>
                <option value="living">Living</option>
                <option value="housing">Housing</option>
                <option value="debt">Debt</option>
                <option value="tax">Tax</option>
              </select></div>
              <div><div className="mobile-label">Amount</div><NumberInput value={line.amount} onChange={(amount) => setBudgetLines(updateItem(budgetLines, line.id, { amount }))} /></div>
              <button className="delete-btn" onClick={() => setBudgetLines(budgetLines.filter((l: any) => l.id !== line.id))}>×</button>
            </div>
          ))}
        </div>
      </section>

      <section className="panel span-6">
        <PanelHeader title="Annual Bills" actionLabel="Add annual bill" onAction={() => setAnnualBills([...annualBills, { id: uid(), label: "Annual bill", amount: 0 }])} />
        <div className="budget-lines">
          <div className="expense-row header desktop-only">
            <span>Label</span>
            <span>Amount</span>
            <span></span>
          </div>
          {annualBills.map((line) => (
            <div className="expense-row" key={line.id}>
              <div><div className="mobile-label">Label</div><TextInput value={line.label} onChange={(label) => setAnnualBills(updateItem(annualBills, line.id, { label }))} /></div>
              <div><div className="mobile-label">Amount</div><NumberInput value={line.amount} onChange={(amount) => setAnnualBills(updateItem(annualBills, line.id, { amount }))} /></div>
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
              <NumberInput value={projectionYears} onChange={setProjectionYears} suffix="yrs" />
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
            const isNhs = bucket.type === 'nhs-pension';
            let nhsIncome = 0;
            if (isNhs) {
              const salary = nhsJobsGross || bucket.nhsSalary || 0;
              const yearsAtRetirement = (bucket.nhsYearsService || 0) + projectionYears;
              const accrual = bucket.nhsScheme === "1995" ? 80 : bucket.nhsScheme === "2008" ? 60 : 54;
              nhsIncome = (salary / accrual) * yearsAtRetirement;
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
                  <div><div className="mobile-label">Bucket Name</div><TextInput value={bucket.label} onChange={(label) => setSavings(updateItem(savings, bucket.id, { label }))} /></div>
                  <div><div className="mobile-label">Type</div>
                    <select value={bucket.type} onChange={(event) => setSavings(updateItem(savings, bucket.id, { type: event.target.value as SavingsBucket["type"] }))}>
                      <option value="cash">Cash</option>
                      <option value="isa">ISA</option>
                      <option value="lisa">Lifetime ISA</option>
                      <option value="pension">Pension / SIPP</option>
                      <option value="workplace-pension">Workplace pension</option>
                      <option value="nhs-pension">NHS Pension</option>
                    </select>
                  </div>
                  <div><div className="mobile-label">Balance</div><NumberInput value={bucket.balance} onChange={(balance) => setSavings(updateItem(savings, bucket.id, { balance }))} /></div>
                  <div><div className="mobile-label">Monthly</div><NumberInput 
                    value={parseFloat(bucket.monthly.toFixed(2))} 
                    onChange={(monthly) => setSavings(updateItem(savings, bucket.id, { monthly }))} 
                  /></div>
                  <div><div className="mobile-label">Growth Rate</div><NumberInput value={bucket.annualRate} onChange={(annualRate) => setSavings(updateItem(savings, bucket.id, { annualRate }))} suffix="%" /></div>
                  <button className="delete-btn" onClick={() => setSavings(savings.filter((s: any) => s.id !== bucket.id))}>×</button>
                </div>

                {/* NHS Sub-Panel: Key fix for the 'Splay' issue */}
                {isNhs && (
                  <div style={{ gridColumn: '1 / -1', background: '#f8fbfd', padding: '16px', borderBottom: '1px solid #e2e8f0' }}>
                    <h4 style={{ margin: '0 0 12px 0', fontSize: '0.8rem', color: '#2c5282', letterSpacing: '0.05em' }}>NHS PENSION CONFIGURATION</h4>
                    <div className="settings-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
                      <label>Annual Salary <NumberInput value={bucket.nhsSalary || 0} onChange={(val) => setSavings(updateItem(savings, bucket.id, { nhsSalary: val }))} /></label>
                      <label>Service Years <NumberInput value={bucket.nhsYearsService || 0} onChange={(val) => setSavings(updateItem(savings, bucket.id, { nhsYearsService: val }))} /></label>
                      <label>Scheme
                        <select style={{ width: '100%', marginTop: '4px' }} value={bucket.nhsScheme || "2015"} onChange={(e) => setSavings(updateItem(savings, bucket.id, { nhsScheme: e.target.value as any }))}>
                          <option value="1995">1995 Scheme (1/80)</option>
                          <option value="2008">2008 Scheme (1/60)</option>
                          <option value="2015">2015 Scheme (1/54)</option>
                        </select>
                      </label>
                    </div>
                    <div style={{ marginTop: '12px', padding: '10px', background: '#ebf4ff', borderRadius: '4px' }}>
                       <strong>Estimated Annual Benefit:</strong> <span style={{ color: '#2b6cb0', fontSize: '1.1rem', fontWeight: 700 }}>{money.format(nhsIncome)} / year</span>
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
        <label>Mortgage amount <NumberInput value={mortgage.amount} onChange={(amount) => setMortgage({ ...mortgage, amount })} /></label>
        <label>Annual rate % <NumberInput value={mortgage.annualRate} onChange={(annualRate) => setMortgage({ ...mortgage, annualRate })} /></label>
        <label>Term years <NumberInput value={mortgage.years} onChange={(years) => setMortgage({ ...mortgage, years })} /></label>
        <label>Monthly overpayment <NumberInput value={mortgage.monthlyOverpayment} onChange={(monthlyOverpayment) => setMortgage({ ...mortgage, monthlyOverpayment })} /></label>
        <label>One-off month <NumberInput value={mortgage.oneOffMonth} onChange={(oneOffMonth) => setMortgage({ ...mortgage, oneOffMonth })} /></label>
        <label>One-off amount <NumberInput value={mortgage.oneOffAmount} onChange={(oneOffAmount) => setMortgage({ ...mortgage, oneOffAmount })} /></label>
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

function TextInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <input value={value} onChange={(event) => onChange(event.target.value)} />;
}

function NumberInput({ value, onChange, suffix }: { value: number; onChange: (value: number) => void; suffix?: string }) {
  return (
    <span className="number-field">
      <input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      {suffix ? <span>{suffix}</span> : null}
    </span>
  );
}

function ResultRows({ rows }: { rows: [string, number][] }) {
  return (
    <div className="result-rows">
      {rows.map(([label, value]) => (
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
    if (type === 'pension' || type === 'workplace-pension') return age >= pensionAccessAge;
    if (type === 'nhs-pension') return age >= 67;
    return true;
  };

  const data = years.map(year => {
    const age = Math.round(retirementAge + year);
    const buckets = projectedSavings
      .filter((b: any) => b.type !== 'nhs-pension' && !b.isHidden)
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
