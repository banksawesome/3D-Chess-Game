export const CHALLENGES = [
  {
    id: "c1",
    title: "Back-Rank Mate",
    side: "w",
    fen: "6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1",
    solution: ["Re8#"],
    description:
      "White to move. The black king is boxed in by its own pawns. Deliver checkmate in a single move.",
    hint: "Strike along the 8th rank — the king has no escape.",
  },
  {
    id: "c2",
    title: "Queen's Finale",
    side: "w",
    fen: "6k1/5ppp/8/8/8/8/5PPP/4Q1K1 w - - 0 1",
    solution: ["Qe8#"],
    description:
      "The same cage, but the rook is gone. Use the queen to end the game in one move.",
    hint: "The 8th rank is completely undefended.",
  },
  {
    id: "c3",
    title: "Mate in Two",
    side: "w",
    fen: "k7/8/KQ6/8/8/8/8/8 w - - 0 1",
    solution: ["Qc6+", "Qb7#"],
    description:
      "White to move. A precise first move forces the black king onto its only square — then mate.",
    hint: "Check from c6 leaves the king no good reply. Then the queen finishes on b7.",
  },
  {
    id: "c4",
    title: "Save the King",
    side: "b",
    fen: "7k/5Kp1/7Q/8/8/8/8/8 b - - 0 1",
    solution: ["gxh6"],
    description:
      "Black to move and in check. There is exactly one move that escapes disaster.",
    hint: "Your pawn can take the queen.",
  },
  {
    id: "c5",
    title: "Only Move",
    side: "w",
    fen: "8/8/8/8/8/7q/5kP1/7K w - - 0 1",
    solution: ["gxh3"],
    description:
      "White to move and in check. Only a single move avoids immediate defeat.",
    hint: "The pawn on g2 is your saviour.",
  },
  {
    id: "c6",
    title: "Winning the Queen",
    side: "w",
    fen: "8/5q2/8/4N1k1/8/8/8/4K3 w - - 0 1",
    solution: ["Nxf7"],
    description:
      "White to move. A knight fork is on the board — take the queen before it escapes.",
    hint: "The knight on e5 attacks the queen and the king at once.",
  },
];

export function getChallenge(id) {
  return CHALLENGES.find((c) => c.id === id) || null;
}
