import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { hostRemote, remoteUrl } from "../lib/remote";
import { useStore } from "../store";

/** HUD button + panel: scan the QR and your phone becomes the controller. */
export function PhoneButton() {
  const [open, setOpen] = useState(false);
  const phones = useStore((s) => s.remote.phones);
  return (
    <>
      <button className={`btn btn--ghost phone-btn ${phones ? "phone-btn--on" : ""}`} onClick={() => setOpen(true)} title="Use your phone as a controller">
        {phones ? `PHONE ×${phones}` : "PHONE"}
      </button>
      {open && <PhonePanel onClose={() => setOpen(false)} />}
    </>
  );
}

function PhonePanel({ onClose }: { onClose: () => void }) {
  const remote = useStore((s) => s.remote);
  const [qr, setQr] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [warning, setWarning] = useState<string | undefined>();

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { code, secret } = await hostRemote();
        const r = await remoteUrl(code, secret);
        if (!alive) return;
        setUrl(r.url);
        setWarning(r.warning);
        setQr(await QRCode.toDataURL(r.url, { margin: 1, width: 360, color: { dark: "#00f0ff", light: "#07020f" } }));
      } catch {
        if (alive) setWarning("Couldn't reach the pairing service. Check the laptop's internet and try again.");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [onClose]);

  const connected = remote.status === "connected";
  return (
    <div className="phone" role="dialog" aria-label="Connect your phone" onClick={onClose}>
      <div className="phone__card" onClick={(e) => e.stopPropagation()}>
        <p className="phone__kicker">PHONE CONTROLLER</p>
        <h2 className="phone__title">{connected ? "CONNECTED" : "SCAN TO PLAY"}</h2>
        <div className={`phone__qr ${connected ? "phone__qr--done" : ""}`}>{qr ? <img src={qr} alt={`QR code for ${url}`} /> : <span>…</span>}</div>
        <p className="phone__code">
          ROOM <b>{remote.code || "····"}</b>
          <span className={`phone__dot phone__dot--${remote.status}`} />
          {remote.status === "connected" ? `${remote.phones} phone${remote.phones > 1 ? "s" : ""}` : remote.status === "error" ? "pairing error" : "waiting"}
        </p>
        <ul className="phone__how">
          <li>Tap the puddles to play rain notes</li>
          <li>Toggle layers, fire BEE-9 vocals</li>
          <li>Tilt to filter · shake (or hold) to drop</li>
        </ul>
        {warning && <p className="phone__warn">{warning}</p>}
        {url && <p className="phone__url">{url}</p>}
        <button className="btn btn--primary" onClick={onClose}>
          {connected ? "LET'S GO" : "CLOSE"}
        </button>
      </div>
    </div>
  );
}
