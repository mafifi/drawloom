export const knowledgeEvaluationSourceIdentity = Object.freeze({
  corpus: Object.freeze({ id: "knowledge-corpus", bytes: 10_539, sha256: "70ab90e0be0e1ba9e7872dbd1e7286b1ef5c5fd343660b5e950cbd8c7a90e5e5" }),
  current: Object.freeze({ id: "retained-current-retrieval", bytes: 24_306, sha256: "f16b69da282f8a15140c46dc9bddc5630c8ae88e5b49c827cb99c8871ca57d87" }),
  historical: Object.freeze({ id: "retained-historical-answer", bytes: 173_165, sha256: "90fa306bd1ec4c1668aae70714d37f1007acc7307a7f4a31a9a47efd4b7ad40a" }),
});

export const knowledgeEvaluationDefinitionIds = Object.freeze({
  currentLexical: "knowledge.current.lexical",
  currentMlx: "knowledge.current.mlx",
  historicalLexical: "knowledge.historical.lexical",
  historicalQwen: "knowledge.historical.cpu-qwen",
  historicalNomic: "knowledge.historical.cpu-nomic",
  syntheticChainOmission: "knowledge.synthetic.c1-chain-omission",
  syntheticStaleOnly: "knowledge.synthetic.x1-stale-only",
});
