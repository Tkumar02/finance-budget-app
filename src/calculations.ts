export type Region = "england-wales-ni" | "scotland";

export type PayeIncome = {
  id: string;
  label: string;
  gross: number;
  pensionRate: number;
  employerPensionContribution: number;
  pensionType?: "standard" | "nhs" | "civil-service" | "teachers" | "police" | "firefighters" | "armed-forces" | "lgps";
};

export type ExpenseLine = {
  id: string;
  label: string;
  amount: number;
  includeInRetirement?: boolean;
  startAge?: number;
  isInflationLinked?: boolean;
  bucket: "living" | "housing" | "debt" | "saving" | "tax" | "food" | "entertainment" | "professional";
};

export type SelfEmployment = {
  id: string;
  label: string;
  gross: number;
  expenses: ExpenseLine[];
  isNiLiable?: boolean;
};

export type BudgetLine = ExpenseLine & {
  bucket: "living" | "housing" | "debt" | "saving" | "tax" | "food" | "entertainment" | "professional";
};

export type SavingsBucket = {
  id: string;
  label: string;
  balance: number;
  monthly: number;
  annualRate: number;
  type: "cash" | "isa" | "pension" | "lisa" | "workplace-private-pension" | "nhs-pension" | "civil-service-pension" | "teachers-pension" | "police-pension" | "firefighters-pension" | "armed-forces-pension" | "lgps-pension";
  isHidden?: boolean;
  stopContributingAge?: number;
  startWithdrawalAge?: number;
  dbSalary?: number;
  dbYearsService?: number;
  dbScheme?: string;
  nhsSalary?: number;
  nhsYearsService?: number;
  nhsScheme?: "1995" | "2008" | "2015";
  lastUpdated?: string;
  totalContributed?: number;
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
  includeStudentLoan?: boolean;
  pensionRate?: number;
};

export const money = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 2,
});

export const monthlyMoney = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 2,
});

const roundPounds = (value: number) => Math.round(value);

export function clampNumber(value: number, min = 0) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, value);
}

export function calculateCurrentBucketValue(bucket: SavingsBucket): {
  currentValue: number;
  contributed: number;
  other: number;
} {
  const currentValue = bucket.balance;
  const contributed = bucket.totalContributed || bucket.balance;
  const other = Math.max(0, currentValue - contributed);
  
  return {
    currentValue,
    contributed,
    other,
  };
}

export function isBucketAccessible(bucket: SavingsBucket, currentAge: number): boolean {
  const type = bucket.type.toLowerCase();
  
  if (type === 'lisa') {
    return currentAge >= 60;
  }
  if (type === 'pension' || type === 'workplace-pension' || type === 'workplace-private-pension' || type.includes('pension')) {
    const age = bucket.startWithdrawalAge || 57; // Default pension age
    return currentAge >= age;
  }
  
  return true; // Cash/ISA are always accessible
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

export function employmentPension(incomes: PayeIncome[]) {
  return incomes.reduce(
    (sum, income) => sum + clampNumber(income.gross) * (clampNumber(income.pensionRate) / 100),
    0,
  );
}

export function employerPensionContributions(incomes: PayeIncome[]) {
  return incomes.reduce(
    (sum, income) => sum + (clampNumber(income.gross) * (clampNumber(income.employerPensionContribution) / 100)),
    0,
  );
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

export function calculateNhsEmployeeRate(gross: number) {
  const annual = clampNumber(gross);
  if (annual <= 13259) return 5.2;
  if (annual <= 27797) return 6.5;
  if (annual <= 33868) return 8.3;
  if (annual <= 50845) return 9.8;
  if (annual <= 65190) return 10.7;
  return 12.5;
}

export function calculateCivilServiceEmployeeRate(gross: number) {
  const annual = clampNumber(gross);
  if (annual <= 34799) return 4.60;
  if (annual <= 56000) return 5.45;
  if (annual <= 150000) return 7.35;
  return 8.05;
}

export function calculateTeachersEmployeeRate(gross: number) {
  const annual = clampNumber(gross);
  if (annual <= 34872.99) return 7.4;
  if (annual <= 46943.99) return 8.9;
  if (annual <= 55660.99) return 9.9;
  if (annual <= 73768.99) return 10.5;
  if (annual <= 100590.99) return 11.6;
  return 12.0;
}

export function calculatePoliceEmployeeRate(gross: number) {
  const annual = clampNumber(gross);
  if (annual <= 27000) return 12.44;
  if (annual <= 60000) return 13.44;
  return 13.78;
}

export function calculateFirefightersEmployeeRate(gross: number) {
  const annual = clampNumber(gross);
  if (annual <= 27818) return 11.0;
  if (annual <= 51515) return 12.9;
  if (annual <= 142500) return 13.5;
  return 14.5;
}

export function calculateLgpsEmployeeRate(gross: number) {
  const annual = clampNumber(gross);
  if (annual <= 17800) return 5.5;
  if (annual <= 28000) return 5.8;
  if (annual <= 45600) return 6.5;
  if (annual <= 57700) return 6.8;
  if (annual <= 81000) return 8.5;
  if (annual <= 114800) return 9.9;
  if (annual <= 135300) return 10.5;
  if (annual <= 203000) return 11.4;
  return 12.5;
}

export const NHS_EMPLOYER_RATE = 23.7;

export function calculateIncomeTax(
  taxableIncomeBeforeAllowance: number,
  taxCode: string,
  grossReliefAtSourcePension = 0,
  region: Region = "england-wales-ni",
  interestIncome = 0,
) {
  const adjustedNetIncome = Math.max(0, taxableIncomeBeforeAllowance + interestIncome - grossReliefAtSourcePension);
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

  // Calculate highest marginal rate for PSA
  // For PSA, we look at the band results and see if any higher/additional rate was hit
  const isHigherRate = bandResults.some(b => (b.label === "Higher" || b.label === "Advanced" || b.label === "Top") && b.taxable > 0);
  const isAdditionalRate = bandResults.some(b => (b.label === "Additional" || b.label === "Top") && b.taxable > 0);
  
  const psaAllowance = isAdditionalRate ? 0 : (isHigherRate ? 500 : 1000);
  const taxableInterest = Math.max(0, interestIncome - psaAllowance);
  
  // Tax on interest is at the marginal rate(s)
  // Simplified: we add interest on top of existing taxable income
  let remainingInterest = taxableInterest;
  let interestTax = 0;
  
  // Re-calculate bands with interest to find interest tax
  let totalWithInterest = taxableAfterAllowance + taxableInterest;
  let remainingTotal = totalWithInterest;
  let previousLimitInt = 0;
  let totalTaxWithInterest = 0;
  
  bands.forEach((band) => {
    const width = band.limit === Infinity ? Infinity : Math.max(0, band.limit - previousLimitInt);
    const taxable = Math.max(0, Math.min(remainingTotal, width));
    const tax = taxable * band.rate;
    totalTaxWithInterest += tax;
    remainingTotal -= taxable;
    previousLimitInt = band.limit;
  });

  interestTax = totalTaxWithInterest - totalTax;

  return {
    adjustedNetIncome,
    allowance,
    taxableAfterAllowance,
    totalTax: totalTax + interestTax,
    incomeTaxOnly: totalTax,
    interestTax,
    psaAllowance,
    taxableInterest,
    isHigherRate,
    isAdditionalRate,
    bandResults,
  };
}

export function calculateNationalInsurance(taxableIncome: number, type: "class1" | "class4") {
  const amount = Math.max(0, taxableIncome);
  
  // 2024/25 Rates (Standard for 2026 unless updated)
  const primaryThreshold = 12570;
  const upperLimit = 50270;
  
  const mainRate = type === "class1" ? 0.08 : 0.06; // 8% for PAYE, 6% for Self-Employed
  const higherRate = 0.02;

  let totalNi = 0;

  if (amount > primaryThreshold) {
    const mainBandAmount = Math.min(amount, upperLimit) - primaryThreshold;
    totalNi += mainBandAmount * mainRate;
  }

  if (amount > upperLimit) {
    const higherBandAmount = amount - upperLimit;
    totalNi += higherBandAmount * higherRate;
  }

  return totalNi;
}

export function calculateTaxSummary(incomes: PayeIncome[], streams: SelfEmployment[], savings: SavingsBucket[], settings: TaxSettings) {
  const payeTaxable = totalPayeTaxable(incomes);
  const payeGross = totalPayeGross(incomes);
  
  // Self employment profit
  const selfProfit = selfEmploymentProfit(streams);
  const niLiableSelfProfit = streams.reduce((sum, stream) => {
    if (!stream.isNiLiable) return sum;
    const expenses = stream.expenses.reduce((expenseSum, expense) => expenseSum + clampNumber(expense.amount), 0);
    return sum + Math.max(0, clampNumber(stream.gross) - expenses);
  }, 0);

  // Savings interest (from non-ISA buckets)
  const annualSavingsInterest = savings
    .filter(s => s.type === "cash")
    .reduce((sum, s) => sum + (clampNumber(s.balance) * (clampNumber(s.annualRate) / 100)), 0);

  const grossReliefAtSourcePension = grossSippFromNet(settings.sippNetContribution);
  const combinedTaxable = payeTaxable + selfProfit;
  const combinedTax = calculateIncomeTax(
    combinedTaxable,
    settings.taxCode,
    grossReliefAtSourcePension,
    settings.region,
    annualSavingsInterest
  );
  
  const payeOnlyTax = calculateIncomeTax(payeTaxable, settings.taxCode, 0, settings.region);
  const enteredTaxPaid = 0;
  const assumedPayeTaxPaid = payeOnlyTax.totalTax;
  const selfAssessmentDue = Math.max(0, combinedTax.totalTax - assumedPayeTaxPaid);
  
  // National Insurance
  const payeNi = incomes.reduce((sum, income) => sum + calculateNationalInsurance(clampNumber(income.gross), "class1"), 0);
  const selfNi = calculateNationalInsurance(niLiableSelfProfit, "class4");
  const totalNi = payeNi + selfNi;

  const employmentPensionTotal = employmentPension(incomes);
  const employerPensionTotal = employerPensionContributions(incomes);
  
  const selfTaxTotal = selfAssessmentDue + selfNi;
  const netAnnual = payeGross - employmentPensionTotal - assumedPayeTaxPaid - payeNi + selfProfit - selfTaxTotal + annualSavingsInterest - combinedTax.interestTax;
  const cashAnnual = payeGross - employmentPensionTotal - assumedPayeTaxPaid - payeNi + selfProfit;
  
  // SIPP Optimization Logic
  const adjustedNet = combinedTax.adjustedNetIncome;
  
  // 1. £100k Taper Recommendation
  const sippGrossNeededToReach100k = Math.max(0, adjustedNet - 100000);
  const sippNetNeededToReach100k = sippGrossNeededToReach100k * 0.8;

  // 2. 40% Threshold Recommendation (to keep £1000 PSA)
  const sippGrossToStayBasic = Math.max(0, adjustedNet - (37700 + 12570));
  const sippNetToStayBasic = sippGrossToStayBasic * 0.8;

  return {
    payeGross,
    payeTaxable,
    selfProfit,
    annualSavingsInterest,
    niLiableSelfProfit,
    combinedTaxable,
    grossReliefAtSourcePension,
    payeOnlyTax,
    combinedTax,
    assumedPayeTaxPaid,
    selfAssessmentDue,
    selfNi,
    selfTaxTotal,
    totalNi,
    sippGrossNeededToReach100k,
    sippNetNeededToReach100k,
    sippGrossToStayBasic,
    sippNetToStayBasic,
    employmentPensionTotal,
    employerPensionTotal,
    netAnnual,
    monthlyNet: netAnnual / 12,
    cashAnnual,
    cashMonthlyNet: cashAnnual / 12,
    isHigherRate: combinedTax.isHigherRate,
    psaAllowance: combinedTax.psaAllowance,
    interestTax: combinedTax.interestTax,
  };
}

export function budgetSummary(
  monthlyNet: number,
  lines: BudgetLine[],
  annualBills: ExpenseLine[] = [],
  savings: SavingsBucket[] = [],
  mortgageOverpayment: number = 0
) {
  const totals = lines.reduce<Record<BudgetLine["bucket"], number>>(
    (acc, line) => {
      acc[line.bucket] += clampNumber(line.amount);
      return acc;
    },
    { living: 0, housing: 0, debt: 0, saving: 0, tax: 0, food: 0, entertainment: 0, professional: 0 },
  );
  const annualBillsMonthly = annualBills.reduce((sum, bill) => sum + clampNumber(bill.amount) / 12, 0);
  const monthlySavings = savings.reduce((sum, bucket) => sum + clampNumber(bucket.monthly), 0) + clampNumber(mortgageOverpayment) + totals["saving"];
  const monthlyExpenses = totals["living"] + totals["housing"] + totals["debt"] + totals["tax"] + totals["food"] + totals["entertainment"] + totals["professional"] + annualBillsMonthly;
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

export function projectSavings(buckets: SavingsBucket[], years: number, birthYear: number, drawdownSettings: Record<string, any> = {}, inflationRate: number = 3) {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const startAge = (currentYear - birthYear) + (currentMonth / 12); // Approximate current age
  const months = Math.max(0, Math.round(years * 12));
  
  const bucketStates = buckets.map(b => ({
    ...b,
    currentBalance: clampNumber(b.balance),
    totalContributed: clampNumber(b.balance),
    withdrawnValue: 0,
    isWithdrawn: false
  }));

  for (let m = 0; m < months; m++) {
    const ageAtMonth = startAge + (m / 12);
    let divertedLisaAmount = 0;

    // 1. Determine contributions for this month
    const monthlyContributions = bucketStates.map(b => {
      if (b.isWithdrawn) return 0;

      const settings = drawdownSettings[b.id] || {};
      const effectiveWithdrawAge = settings.useWithdrawAge ? settings.withdrawAge : b.startWithdrawalAge;
      const effectiveStopAge = settings.useStopAge ? settings.stopAge : b.stopContributingAge;

      // If withdrawal age reached, stop contributions
      if (effectiveWithdrawAge && ageAtMonth >= effectiveWithdrawAge) {
        return 0;
      }

      let contrib = clampNumber(b.monthly);

      // Check for manual contribution stop age
      if (effectiveStopAge && ageAtMonth >= effectiveStopAge) {
        contrib = 0;
      }

      // LISA logic
      if (b.type === 'lisa') {
        if (ageAtMonth < 50) {
          return contrib * 1.25;
        } else {
          divertedLisaAmount += contrib;
          return 0;
        }
      }
      return contrib;
    });

    // 2. Diversion logic (LISA -> ISA -> Cash)
    if (divertedLisaAmount > 0) {
      const isaIdx = bucketStates.findIndex(b => b.type === 'isa' && !b.isWithdrawn);
      if (isaIdx !== -1) {
        const currentIsaMonthly = bucketStates[isaIdx].monthly;
        const availableRoom = Math.max(0, 1666.67 - currentIsaMonthly);
        const amountToDivert = Math.min(divertedLisaAmount, availableRoom);
        monthlyContributions[isaIdx] += amountToDivert;
        divertedLisaAmount -= amountToDivert;
      }
      if (divertedLisaAmount > 0) {
        const cashIdx = bucketStates.findIndex(b => b.type === 'cash' && !b.isWithdrawn);
        if (cashIdx !== -1) {
          monthlyContributions[cashIdx] += divertedLisaAmount;
        }
      }
    }

    // 3. Apply growth and update balances
    bucketStates.forEach((b, idx) => {
      const settings = drawdownSettings[b.id] || {};
      const effectiveWithdrawAge = settings.useWithdrawAge ? settings.withdrawAge : b.startWithdrawalAge;
      const effectiveStopAge = settings.useStopAge ? settings.stopAge : b.stopContributingAge;

      const isWithdrawing = effectiveWithdrawAge && ageAtMonth >= effectiveWithdrawAge;
      const hasStopped = (effectiveStopAge && ageAtMonth >= effectiveStopAge) || isWithdrawing;
      
      const annualGrowthRate = hasStopped ? inflationRate : clampNumber(b.annualRate);
      const monthlyRate = annualGrowthRate / 100 / 12;
      
      if (isWithdrawing) {
        // Pot is in drawdown
        if (b.currentBalance > 0) {
          b.isWithdrawn = true; // Mark as started withdrawal
          const rate = settings.rate ?? 4;
          const annualDrawdownAmount = b.currentBalance * (rate / 100);
          const monthlyDrawdown = annualDrawdownAmount / 12;
          
          // Growth then withdrawal
          b.currentBalance = (b.currentBalance * (1 + monthlyRate)) - monthlyDrawdown;
          if (b.currentBalance < 0) b.currentBalance = 0;
        }
      } else {
        // Normal accumulation
        const contrib = monthlyContributions[idx];
        b.currentBalance = (b.currentBalance * (1 + monthlyRate)) + contrib;
        b.totalContributed += contrib;
      }
    });
  }

  return bucketStates.map(b => ({
    ...b,
    // 'projected' is the balance at the end of the projectionYears
    projected: b.currentBalance,
    finalBalance: b.currentBalance,
    contributed: b.totalContributed,
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

export type FinancialSnapshot = {
  profile: { currentAge: number; retirementAge: number; pensionAccessAge: number };
  financialHealth: {
    monthlyExpenses: number;
    monthlySurplus: number;
    mortgage: { 
      remaining: number; 
      monthlyPayment: number; 
      monthsToPayoff: number; 
      willBePaidOffAtRetirement: boolean; 
      ageAtPayoff: number;
    };
  };
  guaranteedIncome: {
    statePension: { amount: number; age: number };
    dbPensions: { label: string; amount: number; age: number }[];
    other: { label: string; amount: number; age: number; isTaxable: boolean }[];
  };
  buckets: {
    id: string;
    type: string;
    label: string;
    balance: number;
    projected: number;
    isTaxable: boolean;
    accessibleFromAge: number;
    annualRate: number;
  }[];
};

export function getFinancialSnapshot(
  birthYear: number,
  birthMonth: number,
  retirementAge: number,
  budgetExpenses: number,
  monthlySurplus: number,
  mortgageSummary: any,
  mortgageInputs: MortgageInputs,
  savings: any[],
  otherIncome: any[],
  pensionAccessAge: number,
  statePension: { amount: number; age: number },
  dbPensions: { label: string; amount: number; age: number }[]
): FinancialSnapshot {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const currentAge = (currentYear - birthYear) + (currentMonth - birthMonth) / 12;

  const monthsUntilRetirement = (retirementAge - currentAge) * 12;
  const willBePaidOffAtRetirement = mortgageSummary.payoffMonths <= monthsUntilRetirement;
  const ageAtPayoff = currentAge + (mortgageSummary.payoffMonths / 12);

  return {
    profile: { currentAge, retirementAge, pensionAccessAge },
    financialHealth: {
      monthlyExpenses: budgetExpenses,
      monthlySurplus: monthlySurplus,
      mortgage: {
        remaining: mortgageInputs.amount,
        monthlyPayment: mortgageSummary.standardPayment,
        monthsToPayoff: mortgageSummary.payoffMonths,
        willBePaidOffAtRetirement,
        ageAtPayoff
      },
    },
    guaranteedIncome: {
      statePension,
      dbPensions,
      other: otherIncome.map(i => ({
        label: i.label,
        amount: i.amount * 12,
        age: i.startAge || 0,
        isTaxable: i.isTaxable || false,
      }))
    },
    buckets: savings.map(s => {
      let accessibleFromAge = 0;
      const type = s.type.toLowerCase();
      if (type === 'lisa') {
        accessibleFromAge = 60;
      } else if (type === 'pension' || type === 'workplace-pension' || type === 'workplace-private-pension' || type.includes('pension')) {
        // Special case for DB pensions which have their own age
        if (['nhs-pension', 'civil-service-pension', 'teachers-pension'].includes(type)) {
          accessibleFromAge = s.startWithdrawalAge || 67;
        } else {
          accessibleFromAge = pensionAccessAge;
        }
      }
      
      return {
        id: s.id,
        type: s.type,
        label: s.label,
        balance: s.balance,
        projected: s.projected || 0,
        isTaxable: type.includes('pension'),
        accessibleFromAge,
        annualRate: s.annualRate || 0
      };
    }),
  };
}
export function calculateRetirementGrossRequired(
  targetNetFromPots: number,
  taxableFraction: number,
  taxCode: string,
  region: Region,
  baselineTaxableIncome: number = 0
) {
  const netFromTaxable = targetNetFromPots * taxableFraction;
  const netFromNonTaxable = targetNetFromPots * (1 - taxableFraction);

  const baselineTax = calculateIncomeTax(baselineTaxableIncome, taxCode, 0, region).totalTax;

  // Solve for Gross Pension W such that:
  // W - [Tax(W * 0.75 + baselineTaxable) - Tax(baselineTaxable)] = netFromTaxable
  let low = 0;
  let high = Math.max(100000, netFromTaxable * 3);
  for (let i = 0; i < 60; i += 1) {
    const mid = (low + high) / 2;
    const totalTaxable = mid * 0.75 + baselineTaxableIncome;
    const totalTax = calculateIncomeTax(totalTaxable, taxCode, 0, region).totalTax;
    const extraTax = totalTax - baselineTax;
    const net = mid - extraTax;
    
    if (net < netFromTaxable) low = mid;
    else high = mid;
  }
  
  const grossPension = high;
  const totalAnnualTaxOnPots = calculateIncomeTax(grossPension * 0.75 + baselineTaxableIncome, taxCode, 0, region).totalTax - baselineTax;
  
  return {
    grossPension,
    netFromNonTaxable,
    totalGrossAnnual: grossPension + netFromNonTaxable,
    totalAnnualTaxOnPots
  };
}

export function requiredGrossForNet(targetNet: number, taxCode: string, region: Region, includeStudentLoan = false, pensionRate = 0) {
  let low = 0;
  let high = Math.max(50000, targetNet * 3); // Increased multiplier for more headroom with deductions
  for (let i = 0; i < 60; i += 1) {
    const mid = (low + high) / 2;
    
    // Pension deduction (assumed Net Pay arrangement: reduces taxable income, not NI)
    const pensionAmount = mid * (pensionRate / 100);
    const taxableIncome = Math.max(0, mid - pensionAmount);
    
    const tax = calculateIncomeTax(taxableIncome, taxCode, 0, region).totalTax;
    const ni = calculateNationalInsurance(mid, "class1");
    
    // Student Loan (Plan 2 / Plan 5 style approximation: 9% over ~£25k-£27k)
    let studentLoan = 0;
    if (includeStudentLoan) {
      const threshold = 27295; // Plan 2 threshold for 2024/25
      studentLoan = Math.max(0, (mid - threshold) * 0.09);
    }
    
    const net = mid - tax - ni - pensionAmount - studentLoan;
    
    if (net < targetNet) low = mid;
    else high = mid;
  }
  return roundPounds(high);
}
