// Shown the moment a tab is clicked, while the next page loads. The green column keeps the layout steady.
export default function Loading() {
  const bar = (w: string, h = 14) => <div style={{ width: w, height: h, borderRadius: 8, background: '#E3EEE8' }} />;
  return (
    <>
        <div className="top">
          <div className="fx col g8">
            {bar('220px', 26)}
            {bar('380px')}
          </div>
        </div>
        <div className="ct" role="status" aria-label="Loading" aria-busy="true">
          <div className="grid4">
            {[0, 1, 2, 3].map((i) => <div key={i} className="card col g8">{bar('50%')}{bar('30%', 30)}</div>)}
          </div>
          <div className="card col">{bar('100%', 18)}{bar('100%', 18)}{bar('100%', 18)}{bar('70%', 18)}</div>
        </div>
    </>
  );
}
