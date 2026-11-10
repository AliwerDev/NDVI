import { AlertIcon, CheckIcon, CloseIcon, SpinnerIcon } from "@/components/icons";

type Props = {
  busy: boolean;
  message: string | null;
  error: string | null;
  onCloseMessage: () => void;
  onCloseError: () => void;
};

export default function Toasts({ busy, message, error, onCloseMessage, onCloseError }: Props) {
  return (
    <div className="toasts">
      {busy && (
        <div role="status" className="toast">
          <span className="toast-icon">
            <SpinnerIcon size={16} className="spin" />
          </span>
          <p>Kuting…</p>
        </div>
      )}
      {message && (
        <div role="status" className="toast toast-ok">
          <span className="toast-icon">
            <CheckIcon size={16} />
          </span>
          <p>{message}</p>
          <button type="button" className="toast-close" aria-label="Yopish" onClick={onCloseMessage}>
            <CloseIcon size={16} />
          </button>
        </div>
      )}
      {error && (
        <div role="alert" className="toast toast-error">
          <span className="toast-icon">
            <AlertIcon size={16} />
          </span>
          <p>Xato: {error}</p>
          <button type="button" className="toast-close" aria-label="Yopish" onClick={onCloseError}>
            <CloseIcon size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
