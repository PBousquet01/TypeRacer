const TEXTS = [
  "The chocobo stretched its long yellow legs, fluffed its feathers, and waited for the gate to open. Somewhere in the crowd a child shouted its name.",
  "Racing is easy when the track is flat. The real test comes at the muddy corner, where even the fastest birds slow down and the patient ones pull ahead.",
  "Every rider knows the secret: a happy chocobo runs faster. A handful of greens before the race is worth more than any expensive saddle.",
  "The black chocobo had never lost a race, but it had never raced in the rain either. The clouds rolled in just as the countdown began.",
  "Typing fast is a lot like running fast. Stay relaxed, keep a steady rhythm, and do not panic when you make a mistake. Just fix it and keep going.",
  "At the finish line the winner let out a proud kweh, and the whole stadium answered back. Nobody remembered who came second, except the bird who did.",
];

export function pickText(): string {
  return TEXTS[Math.floor(Math.random() * TEXTS.length)];
}
