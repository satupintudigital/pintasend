// Renderer sintaks untuk contoh kode. Token berupa tuple [tipe, teks]:
//   c = komentar · k = command/key · f = flag · s = string · n = angka/variable · p = tanda baca · plain = teks biasa
const tokClass: Record<string, string> = {
  c: "tok-c",
  k: "tok-k",
  f: "tok-f",
  s: "tok-s",
  n: "tok-n",
  p: "tok-p",
};

export type Token = [string, string];

export function Tokens({ tokens }: { tokens: Token[] }) {
  return (
    <>
      {tokens.map(([type, text], i) => {
        const cls = tokClass[type];
        return cls ? (
          <span key={i} className={cls}>
            {text}
          </span>
        ) : (
          <span key={i}>{text}</span>
        );
      })}
    </>
  );
}
