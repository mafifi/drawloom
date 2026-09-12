export interface RetrievalMetricQuestion {
  readonly id: string;
  readonly kind: "semantic" | "identifier" | "chain" | "contradiction" | "irrelevant";
  readonly relevant: readonly string[];
  readonly requiredChain: readonly string[];
  readonly abstain: boolean;
}

export interface RetrievalMetrics {
  readonly relevantEvidence: { readonly precision: number; readonly recall: number };
  readonly exactIdentifierRecall: number;
  readonly chainCompleteness: number;
  readonly irrelevantAbstention: number;
}

export type RetrievalQuestionCategory = RetrievalMetricQuestion["kind"];
export type RetrievalCategoryMetrics = Readonly<Record<RetrievalQuestionCategory, RetrievalMetrics>>;

const categories = ["semantic", "identifier", "chain", "contradiction", "irrelevant"] as const satisfies readonly RetrievalQuestionCategory[];

/** Scores exact corpus references; expected answers are intentionally not inputs. */
export function scoreRetrieval(input: {
  readonly questions: readonly RetrievalMetricQuestion[];
  readonly retrieved: Readonly<Record<string, readonly string[]>>;
}): RetrievalMetrics {
  let returned = 0;
  let relevantReturned = 0;
  let relevantExpected = 0;
  let identifierExpected = 0;
  let identifierReturned = 0;
  let chains = 0;
  let completeChains = 0;
  let abstentions = 0;
  let correctAbstentions = 0;
  for (const question of input.questions) {
    const records = input.retrieved[question.id] ?? [];
    const actual = new Set(records);
    const relevant = new Set(question.relevant);
    returned += records.length;
    relevantExpected += relevant.size;
    for (const ref of records) if (relevant.has(ref)) relevantReturned++;
    if (question.kind === "identifier") {
      identifierExpected += relevant.size;
      for (const ref of relevant) if (actual.has(ref)) identifierReturned++;
    }
    if (question.requiredChain.length > 0) {
      chains++;
      if (question.requiredChain.every((ref) => actual.has(ref))) completeChains++;
    }
    if (question.abstain) { abstentions++; if (records.length === 0) correctAbstentions++; }
  }
  return {
    relevantEvidence: { precision: ratio(relevantReturned, returned), recall: ratio(relevantReturned, relevantExpected) },
    exactIdentifierRecall: ratio(identifierReturned, identifierExpected),
    chainCompleteness: ratio(completeChains, chains),
    irrelevantAbstention: ratio(correctAbstentions, abstentions),
  };
}

/** Scores each frozen question category independently for downstream answer evaluation. */
export function scoreRetrievalByCategory(input: {
  readonly questions: readonly RetrievalMetricQuestion[];
  readonly retrieved: Readonly<Record<string, readonly string[]>>;
}): RetrievalCategoryMetrics {
  return Object.fromEntries(categories.map((category) => [category, scoreRetrieval({
    questions: input.questions.filter((question) => question.kind === category),
    retrieved: input.retrieved,
  })])) as RetrievalCategoryMetrics;
}

function ratio(numerator: number, denominator: number): number { return denominator === 0 ? 1 : numerator / denominator; }
