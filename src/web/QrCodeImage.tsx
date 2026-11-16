import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export function QrCodeImage({ value, alt }: { value: string; alt: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    QRCode.toDataURL(value, { errorCorrectionLevel: 'M', margin: 2, width: 200, color: { dark: '#000000', light: '#ffffff' } })
      .then((url) => live && setSrc(url))
      .catch(() => live && setSrc(null));
    return () => {
      live = false;
    };
  }, [value]);
  if (!src) return null;
  return <img className="ticket__qr" src={src} width={200} height={200} alt={alt} />;
}
