// Gray placeholders for the sidebar while its data loads. Screen readers hear one short status text instead.

const FIELD_NAME_WIDTHS = [140, 100, 120];

export function AccountSkeleton() {
  return (
    <div className="account" aria-hidden="true">
      <span className="sk sk-avatar" />
      <span className="account-name sk-lines">
        <span className="sk" style={{ width: 110, height: 12 }} />
        <span className="sk" style={{ width: 150, height: 10 }} />
      </span>
    </div>
  );
}

export function FieldListSkeleton() {
  return (
    <>
      <p role="status" className="sr-only">
        Maydonlar yuklanmoqda
      </p>
      <ul className="field-list" aria-hidden="true">
        {FIELD_NAME_WIDTHS.map((width) => (
          <li key={width} className="sk-row">
            <span className="sk" style={{ width: 18, height: 12 }} />
            <span className="sk" style={{ width, height: 12 }} />
            <span className="sk sk-end" style={{ width: 44, height: 12 }} />
          </li>
        ))}
      </ul>
    </>
  );
}

/** Same size as the compact NdviChart. */
export function ChartSkeleton() {
  return (
    <>
      <p role="status" className="sr-only">
        Kuzatuvlar yuklanmoqda
      </p>
      <span className="sk sk-chart" aria-hidden="true" />
    </>
  );
}

export function ObservationSkeleton() {
  return (
    <section className="card" aria-hidden="true">
      <h2>Tanlangan kuzatuv</h2>
      <span className="sk" style={{ width: 140, height: 12 }} />
      {[1, 2, 3].map((row) => (
        <div key={row} className="sk-row">
          <span className="sk" style={{ width: 44, height: 14 }} />
          <span className="sk" style={{ width: 56, height: 22, borderRadius: 7 }} />
          <span className="sk sk-grow" style={{ height: 8, borderRadius: 4 }} />
        </div>
      ))}
    </section>
  );
}
