import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
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
} from "./calculations";
import "./styles.css";

type SectionId = "overview" | "income" | "tax" | "budget" | "savings" | "mortgage";

const uid = () => crypto.randomUUID();

const initialPaye: PayeIncome[] = [
  { id: uid(), label: "Main PAYE job", gross: 80000, pensionRate: 9, employerPensionContribution: 0, taxPaid: 0 },
  { id: uid(), label: "Second PAYE job", gross: 9000, pensionRate: 5.2, employerPensionContribution: 0, taxPaid: 0 },
];

const initialSelfEmployment: SelfEmployment[] = [
  {
    id: uid(),
    label: "Rental / sole trader",
    gross: 25000,
    expenses: [
      { id: uid(), label: "Insurance", amount: 500 },
      { id: uid(), label: "Accountant", amount: 800 },
      { id: uid(), label: "Maintenance", amount: 6000 },
    ],
  },
  {
    id: uid(),
    label: "Delivery / company work",
    gross: 13000,
    expenses: [
      { id: uid(), label: "Van insurance", amount: 800 },
      { id: uid(), label: "Fuel", amount: 600 },
      { id: uid(), label: "Maintenance", amount: 1000 },
    ],
  },
];

const initialBudget: BudgetLine[] = [
  { id: uid(), label: "Mortgage", amount: 1000, bucket: "housing" },
  { id: uid(), label: "Bills", amount: 1100, bucket: "living" },
  { id: uid(), label: "General spending", amount: 1200, bucket: "living" },
];

const initialAnnualBills: ExpenseLine[] = [
  { id: uid(), label: "Professional fees", amount: 456 },
  { id: uid(), label: "Insurance", amount: 1300 },
];

const initialSavings: SavingsBucket[] = [
  { id: uid(), label: "Cash reserve", balance: 6000, monthly: 350, annualRate: 3, type: "cash" },
  { id: uid(), label: "Stocks ISA", balance: 17500, monthly: 667, annualRate: 5, type: "isa" },
  { id: uid(), label: "Lifetime ISA", balance: 5000, monthly: 333, annualRate: 5, type: "lisa" },
  { id: uid(), label: "Pension / SIPP", balance: 3000, monthly: 709, annualRate: 5, type: "pension" },
  { id: uid(), label: "Workplace pension", balance: 31000, monthly: 0, annualRate: 5, type: "workplace-pension" },
];

function App() {
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
    amount: 300000,
    annualRate: 4,
    years: 30,
    monthlyOverpayment: 1000,
    oneOffMonth: 0,
    oneOffAmount: 0,
  });

  const tax = useMemo(
    () => calculateTaxSummary(paye, selfEmployment, taxSettings),
    [paye, selfEmployment, taxSettings],
  );
  const savingsForBudget = useMemo(
    () => savings.filter((bucket) => bucket.type !== "workplace-pension"),
    [savings],
  );
  const projectionBuckets = useMemo(
    () =>
      savings.map((bucket) =>
        bucket.type === "workplace-pension"
          ? { ...bucket, monthly: bucket.monthly + (tax.employmentPensionTotal + tax.employerPensionTotal) / 12 }
          : bucket,
      ),
    [savings, tax.employmentPensionTotal, tax.employerPensionTotal],
  );
  const budget = useMemo(
    () => budgetSummary(tax.monthlyNet, budgetLines, annualBills, savingsForBudget),
    [tax.monthlyNet, budgetLines, annualBills, savingsForBudget],
  );
  const projectedSavings = useMemo(
    () => projectSavings(projectionBuckets, projectionYears),
    [projectionBuckets, projectionYears],
  );
  const mortgageSummary = useMemo(() => calculateMortgage(mortgage), [mortgage]);
  const targetGross = useMemo(
    () => requiredGrossForNet(Math.max(0, budget.monthlyOut * 12), taxSettings.taxCode, taxSettings.region),
    [budget.monthlyOut, taxSettings],
  );
  const projectedTotal = projectedSavings.reduce((sum, bucket) => sum + bucket.projected, 0);

  const sections = [
    { id: "overview", title: "Overview", value: monthlyMoney.format(budget.monthlySurplus), detail: "monthly surplus" },
    { id: "income", title: "Income", value: money.format(tax.payeGross + tax.selfProfit), detail: "gross + profit" },
    { id: "tax", title: "Tax", value: monthlyMoney.format(tax.selfAssessmentDue / 12), detail: "monthly set-aside" },
    { id: "budget", title: "Budget", value: monthlyMoney.format(budget.monthlyOut), detail: "monthly outflow" },
    { id: "savings", title: "Savings", value: money.format(projectedTotal), detail: `${projectionYears} year projection` },
    { id: "mortgage", title: "Mortgage", value: `${mortgageSummary.payoffYears.toFixed(1)} yrs`, detail: "payoff estimate" },
  ] satisfies { id: SectionId; title: string; value: string; detail: string }[];

  return (
    <main className="app-shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">2026-2027 UK planning estimator</p>
          <h1>Income Plan</h1>
        </div>
        <div className="notice">Estimator only. Check HMRC rules for filing decisions.</div>
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
          sippNetContribution={taxSettings.sippNetContribution}
          setActiveSection={setActiveSection}
        />
      ) : null}

      {activeSection === "income" ? (
        <IncomeSection
          paye={paye}
          setPaye={setPaye}
          selfEmployment={selfEmployment}
          setSelfEmployment={setSelfEmployment}
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
          employmentPensionMonthly={tax.employmentPensionTotal / 12}
          employerPensionMonthly={tax.employerPensionTotal / 12}
        />
      ) : null}

      {activeSection === "mortgage" ? (
        <MortgageSection mortgage={mortgage} setMortgage={setMortgage} mortgageSummary={mortgageSummary} />
      ) : null}
    </main>
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
          <div className="callout green">
            <strong>Under threshold</strong>
            <span>Your adjusted net income is estimated below GBP 100,000 after the current SIPP input.</span>
          </div>
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
}: {
  paye: PayeIncome[];
  setPaye: React.Dispatch<React.SetStateAction<PayeIncome[]>>;
  selfEmployment: SelfEmployment[];
  setSelfEmployment: React.Dispatch<React.SetStateAction<SelfEmployment[]>>;
}) {
  return (
    <div className="workspace">
      <section className="panel span-12">
        <PanelHeader
          title="PAYE Income"
          actionLabel="Add PAYE"
          onAction={() =>
            setPaye([...paye, { id: uid(), label: "New PAYE job", gross: 0, pensionRate: 0, employerPensionContribution: 0, taxPaid: 0 }])
          }
        />
        <div className="table income-table">
          <div className="table-row header">
            <span>PAYE income</span>
            <span>Gross</span>
            <span>Employee pension %</span>
            <span>Employer pension</span>
            <span>Tax paid</span>
          </div>
          {paye.map((income) => (
            <div className="table-row" key={income.id}>
              <TextInput value={income.label} onChange={(label) => setPaye(updateItem(paye, income.id, { label }))} />
              <NumberInput value={income.gross} onChange={(gross) => setPaye(updateItem(paye, income.id, { gross }))} />
              <NumberInput value={income.pensionRate} onChange={(pensionRate) => setPaye(updateItem(paye, income.id, { pensionRate }))} suffix="%" />
              <NumberInput value={income.employerPensionContribution} onChange={(employerPensionContribution) => setPaye(updateItem(paye, income.id, { employerPensionContribution }))} />
              <NumberInput value={income.taxPaid} onChange={(taxPaid) => setPaye(updateItem(paye, income.id, { taxPaid }))} />
            </div>
          ))}
        </div>
      </section>

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
                <TextInput value={stream.label} onChange={(label) => setSelfEmployment(updateItem(selfEmployment, stream.id, { label }))} />
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
          {budgetLines.map((line) => (
            <div className="budget-row" key={line.id}>
              <TextInput value={line.label} onChange={(label) => setBudgetLines(updateItem(budgetLines, line.id, { label }))} />
              <select value={line.bucket} onChange={(event) => setBudgetLines(updateItem(budgetLines, line.id, { bucket: event.target.value as BudgetLine["bucket"] }))}>
                <option value="living">Living</option>
                <option value="housing">Housing</option>
                <option value="debt">Debt</option>
                <option value="tax">Tax</option>
              </select>
              <NumberInput value={line.amount} onChange={(amount) => setBudgetLines(updateItem(budgetLines, line.id, { amount }))} />
            </div>
          ))}
        </div>
      </section>

      <section className="panel span-6">
        <PanelHeader title="Annual Bills" actionLabel="Add annual bill" onAction={() => setAnnualBills([...annualBills, { id: uid(), label: "Annual bill", amount: 0 }])} />
        <div className="budget-lines">
          {annualBills.map((line) => (
            <div className="expense-row" key={line.id}>
              <TextInput value={line.label} onChange={(label) => setAnnualBills(updateItem(annualBills, line.id, { label }))} />
              <NumberInput value={line.amount} onChange={(amount) => setAnnualBills(updateItem(annualBills, line.id, { amount }))} />
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
  employmentPensionMonthly,
  employerPensionMonthly,
}: {
  savings: SavingsBucket[];
  setSavings: React.Dispatch<React.SetStateAction<SavingsBucket[]>>;
  projectionYears: number;
  setProjectionYears: React.Dispatch<React.SetStateAction<number>>;
  projectedSavings: (SavingsBucket & { projected: number; contributed: number })[];
  projectedTotal: number;
  employmentPensionMonthly: number;
  employerPensionMonthly: number;
}) {
  return (
    <div className="workspace">
      <section className="panel span-12">
        <div className="split-title">
          <h2>Savings Projection</h2>
          <label className="inline-field">
            Years
            <NumberInput value={projectionYears} onChange={setProjectionYears} />
          </label>
        </div>
        <div className="table savings-table">
          <div className="table-row header">
            <span>Bucket</span>
            <span>Type</span>
            <span>Current capital</span>
            <span>Monthly saving</span>
            <span>Growth %</span>
          </div>
          {savings.map((bucket) => (
            <div className="table-row" key={bucket.id}>
              <TextInput value={bucket.label} onChange={(label) => setSavings(updateItem(savings, bucket.id, { label }))} />
              <select value={bucket.type} onChange={(event) => setSavings(updateItem(savings, bucket.id, { type: event.target.value as SavingsBucket["type"] }))}>
                <option value="cash">Cash</option>
                <option value="isa">ISA</option>
                <option value="lisa">Lifetime ISA</option>
                <option value="pension">Pension / SIPP</option>
                <option value="workplace-pension">Workplace pension</option>
              </select>
              <NumberInput value={bucket.balance} onChange={(balance) => setSavings(updateItem(savings, bucket.id, { balance }))} />
              <NumberInput value={bucket.monthly} onChange={(monthly) => setSavings(updateItem(savings, bucket.id, { monthly }))} />
              <NumberInput value={bucket.annualRate} onChange={(annualRate) => setSavings(updateItem(savings, bucket.id, { annualRate }))} suffix="%" />
            </div>
          ))}
        </div>
        <button
          onClick={() =>
            setSavings([...savings, { id: uid(), label: "New savings bucket", balance: 0, monthly: 0, annualRate: 3, type: "cash" }])
          }
        >
          Add savings bucket
        </button>
        <div className="callout">
          <strong>{monthlyMoney.format(employmentPensionMonthly + employerPensionMonthly)}</strong>
          <span>
            monthly workplace pension projection includes employee pension deductions plus employer contributions.
            Employer contributions are not used in the tax calculation.
          </span>
        </div>
      </section>

      <section className="panel span-12">
        <div className="projection-bars">
          {projectedSavings.map((bucket) => (
            <div className="projection-row" key={bucket.id}>
              <div>
                <strong>{bucket.label}</strong>
                <span>{bucket.type.toUpperCase()} - {monthlyMoney.format(bucket.monthly)}/mo</span>
              </div>
              <div className="bar-track">
                <div style={{ width: `${Math.max(3, (bucket.projected / Math.max(1, projectedTotal)) * 100)}%` }} />
              </div>
              <b>{money.format(bucket.projected)}</b>
            </div>
          ))}
        </div>
        <Metric label={`Projected total in ${projectionYears} years`} value={money.format(projectedTotal)} tone="green" />
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

createRoot(document.getElementById("root")!).render(<App />);
