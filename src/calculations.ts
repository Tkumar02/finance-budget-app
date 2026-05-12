export type Region = "england-wales-ni" | "scotland";

export type PayeIncome = {
  id: string;
  label: string;
  gross: number;
  pensionRate: number;
  employerPensionContribution: number;
  taxPaid: number;
};

export type ExpenseLine = {
  id: string;
  label: string;
  amount: number;
};

export type SelfEmployment = {
  id: string;
  label: string;
  gross: number;
  expenses: ExpenseLine[];
};

export type BudgetLine = ExpenseLine & {
  bucket: "living" | "housing" | "debt" | "saving" | "tax";
};

export type SavingsBucket = {
  id: string;
  label: string;
  balance: number;
  monthly: number;
  annualRate: number;
  type: "cash" | "isa" | "pension" | "lisa" | "workplace-pension" | "nhs-pension";
  isHidden?:boolean;
  nhsSalary?: number;
  nhsYearsService?: number;
  nhsScheme?: "1995" | "2008" | "2015";
};

export type MortgageInputs = {
  amount: number;
  annualRate: number;
  years: number;
  monthlyOverpayment: number;
  oneOffMonth: number;
  oneOffAmount: number;
};

export type TaxSettings = {
  taxCode: string;
  region: Region;
  sippNetContribution: number;
};

export const money = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

export const monthlyMoney = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

const roundPounds = (value: number) => Math.round(value);

export function clampNumber(value: number, min = 0) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, value);
}

export function parseTaxCodeAllowance(code: string) {
  const normalized = code.trim().toUpperCase();
  const match = normalized.match(/^([K]?)(\d+)/);
  if (!match) return 12570;
  const allowance = Number(match[2]) * 10;
  return match[1] === "K" ? -allowance : allowance;
}

export function totalPayeGross(incomes: PayeIncome[]) {
  return incomes.reduce((sum, income) => sum + clampNumber(income.gross), 0);
}

export function totalPayeTaxable(incomes: PayeIncome[]) {
  return incomes.reduce((sum, income) => {
    const gross = clampNumber(income.gross);
    const percentagePension = gross * (clampNumber(income.pensionRate) / 100);
    return sum + Math.max(0, gross - percentagePension);
  }, 0);
}

export function totalPayeTaxPaid(incomes: PayeIncome[]) {
  return incomes.reduce((sum, income) => sum + clampNumber(income.taxPaid), 0);
}

export function employmentPension(incomes: PayeIncome[]) {
  return incomes.reduce(
    (sum, income) => sum + clampNumber(income.gross) * (clampNumber(income.pensionRate) / 100),
    0,
  );
}

export function employerPensionContributions(incomes: PayeIncome[]) {
  return incomes.reduce((sum, income) => sum + clampNumber(income.employerPensionContribution), 0);
}

export function selfEmploymentProfit(streams: SelfEmployment[]) {
  return streams.reduce((sum, stream) => {
    const expenses = stream.expenses.reduce((expenseSum, expense) => expenseSum + clampNumber(expense.amount), 0);
    return sum + Math.max(0, clampNumber(stream.gross) - expenses);
  }, 0);
}

export function grossSippFromNet(netContribution: number) {
  return clampNumber(netContribution) * 1.25;
}

export function personalAllowance(adjustedNetIncome: number, taxCode: string) {
  const baseAllowance = parseTaxCodeAllowance(taxCode);
  if (baseAllowance <= 0) return baseAllowance;
  const taper = Math.max(0, (adjustedNetIncome - 100000) / 2);
  return Math.max(0, baseAllowance - taper);
}

export function calculateIncomeTax(
  taxableIncomeBeforeAllowance: number,
  taxCode: string,
  grossReliefAtSourcePension = 0,
  region: Region = "england-wales-ni",
) {
  const adjustedNetIncome = Math.max(0, taxableIncomeBeforeAllowance - grossReliefAtSourcePension);
  const allowance = personalAllowance(adjustedNetIncome, taxCode);
  const taxableAfterAllowance = Math.max(0, taxableIncomeBeforeAllowance - allowance);
  const basicExtension = grossReliefAtSourcePension;

  const bands =
    region === "scotland"
      ? [
          { label: "Starter", limit: 3967, rate: 0.19 },
          { label: "Basic", limit: 16956, rate: 0.2 },
          { label: "Intermediate", limit: 31092, rate: 0.21 },
          { label: "Higher", limit: 62430, rate: 0.42 },
          { label: "Advanced", limit: 125140, rate: 0.45 },
          { label: "Top", limit: Infinity, rate: 0.48 },
        ]
      : [
          { label: "Basic", limit: 37700 + basicExtension, rate: 0.2 },
          { label: "Higher", limit: 125140 - 12570 + basicExtension, rate: 0.4 },
          { label: "Additional", limit: Infinity, rate: 0.45 },
        ];

  let remaining = taxableAfterAllowance;
  let previousLimit = 0;
  let totalTax = 0;
  const bandResults = bands.map((band) => {
    const width = band.limit === Infinity ? Infinity : Math.max(0, band.limit - previousLimit);
    const taxable = Math.max(0, Math.min(remaining, width));
    const tax = taxable * band.rate;
    totalTax += tax;
    remaining -= taxable;
    previousLimit = band.limit;
    return { ...band, taxable, tax };
  });

  return {
    adjustedNetIncome,
    allowance,
    taxableAfterAllowance,
    totalTax,
    bandResults,
  };
}

export function calculateTaxSummary(incomes: PayeIncome[], streams: SelfEmployment[], settings: TaxSettings) {
  const payeTaxable = totalPayeTaxable(incomes);
  const payeGross = totalPayeGross(incomes);
  const selfProfit = selfEmploymentProfit(streams);
  const grossReliefAtSourcePension = grossSippFromNet(settings.sippNetContribution);
  const combinedTaxable = payeTaxable + selfProfit;
  const combinedTax = calculateIncomeTax(
    combinedTaxable,
    settings.taxCode,
    grossReliefAtSourcePension,
    settings.region,
  );
  const payeOnlyTax = calculateIncomeTax(payeTaxable, settings.taxCode, 0, settings.region);
  const enteredTaxPaid = totalPayeTaxPaid(incomes);
  const assumedPayeTaxPaid = enteredTaxPaid > 0 ? enteredTaxPaid : payeOnlyTax.totalTax;
  const selfAssessmentDue = Math.max(0, combinedTax.totalTax - assumedPayeTaxPaid);
  const employmentPensionTotal = employmentPension(incomes);
  const employerPensionTotal = employerPensionContributions(incomes);
  const netAnnual = payeGross - employmentPensionTotal - assumedPayeTaxPaid + selfProfit - selfAssessmentDue;
  const sippGrossNeededToReach100k = Math.max(0, combinedTax.adjustedNetIncome - 100000);
  const sippNetNeededToReach100k = sippGrossNeededToReach100k * 0.8;

  return {
    payeGross,
    payeTaxable,
    selfProfit,
    combinedTaxable,
    grossReliefAtSourcePension,
    payeOnlyTax,
    combinedTax,
    assumedPayeTaxPaid,
    selfAssessmentDue,
    sippGrossNeededToReach100k,
    sippNetNeededToReach100k,
    employmentPensionTotal,
    employerPensionTotal,
    netAnnual,
    monthlyNet: netAnnual / 12,
  };
}

export function budgetSummary(monthlyNet: number, lines: BudgetLine[], annualBills: ExpenseLine[] = [], savings: SavingsBucket[] = []) {
  const totals = lines.reduce<Record<BudgetLine["bucket"], number>>(
    (acc, line) => {
      acc[line.bucket] += clampNumber(line.amount);
      return acc;
    },
    { living: 0, housing: 0, debt: 0, saving: 0, tax: 0 },
  );
  const annualBillsMonthly = annualBills.reduce((sum, bill) => sum + clampNumber(bill.amount) / 12, 0);
  const monthlySavings = savings.reduce((sum, bucket) => sum + clampNumber(bucket.monthly), 0);
  const monthlyExpenses = totals.living + totals.housing + totals.debt + totals.tax + annualBillsMonthly;
  const monthlyOut = monthlyExpenses + monthlySavings;
  return {
    totals,
    annualBillsMonthly,
    monthlyExpenses,
    monthlySavings,
    monthlyOut,
    monthlySurplus: monthlyNet - monthlyOut,
    annualSurplus: (monthlyNet - monthlyOut) * 12,
  };
}

export function futureValue(balance: number, monthly: number, annualRate: number, years: number) {
  const months = Math.max(0, Math.round(years * 12));
  const monthlyRate = clampNumber(annualRate) / 100 / 12;
  let value = clampNumber(balance);
  for (let i = 0; i < months; i += 1) {
    value = value * (1 + monthlyRate) + clampNumber(monthly);
  }
  return value;
}

export function projectSavings(buckets: SavingsBucket[], years: number) {
  return buckets.map((bucket) => ({
    ...bucket,
    projected: futureValue(bucket.balance, bucket.monthly, bucket.annualRate, years),
    contributed: bucket.balance + bucket.monthly * years * 12,
  }));
}

export function monthlyMortgagePayment(amount: number, annualRate: number, years: number) {
  const principal = clampNumber(amount);
  const months = Math.max(1, Math.round(clampNumber(years) * 12));
  const monthlyRate = clampNumber(annualRate) / 100 / 12;
  if (monthlyRate === 0) return principal / months;
  return (principal * monthlyRate) / (1 - (1 + monthlyRate) ** -months);
}

export function calculateMortgage(inputs: MortgageInputs) {
  const standardPayment = monthlyMortgagePayment(inputs.amount, inputs.annualRate, inputs.years);
  const monthlyRate = clampNumber(inputs.annualRate) / 100 / 12;
  const rows = [];
  let balance = clampNumber(inputs.amount);
  let cumulativeInterest = 0;
  let month = 1;

  while (balance > 0.5 && month <= 600) {
    const interest = balance * monthlyRate;
    const capital = Math.min(balance, standardPayment - interest);
    const extra = Math.min(
      balance - capital,
      clampNumber(inputs.monthlyOverpayment) +
        (month === Math.round(inputs.oneOffMonth) ? clampNumber(inputs.oneOffAmount) : 0),
    );
    const endingBalance = Math.max(0, balance + interest - standardPayment - extra);
    cumulativeInterest += interest;
    rows.push({
      month,
      startingBalance: balance,
      payment: standardPayment,
      interest,
      capital,
      extra,
      endingBalance,
      cumulativeInterest,
    });
    balance = endingBalance;
    month += 1;
  }

  const noOverpaymentInterest = calculateInterestWithoutOverpayments(inputs.amount, inputs.annualRate, inputs.years);
  return {
    standardPayment,
    payoffMonths: rows.length,
    payoffYears: rows.length / 12,
    totalInterest: cumulativeInterest,
    interestSaved: Math.max(0, noOverpaymentInterest - cumulativeInterest),
    rows,
  };
}

function calculateInterestWithoutOverpayments(amount: number, annualRate: number, years: number) {
  const payment = monthlyMortgagePayment(amount, annualRate, years);
  const monthlyRate = clampNumber(annualRate) / 100 / 12;
  let balance = clampNumber(amount);
  let interestTotal = 0;
  const months = Math.max(1, Math.round(clampNumber(years) * 12));
  for (let month = 1; month <= months; month += 1) {
    const interest = balance * monthlyRate;
    interestTotal += interest;
    balance = Math.max(0, balance + interest - payment);
  }
  return interestTotal;
}

export function requiredGrossForNet(targetNet: number, taxCode: string, region: Region) {
  let low = 0;
  let high = Math.max(50000, targetNet * 2.5);
  for (let i = 0; i < 60; i += 1) {
    const mid = (low + high) / 2;
    const tax = calculateIncomeTax(mid, taxCode, 0, region).totalTax;
    const net = mid - tax;
    if (net < targetNet) low = mid;
    else high = mid;
  }
  return roundPounds(high);
}
