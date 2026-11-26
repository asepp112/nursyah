import { jsPDF } from 'jspdf';
import { Letter } from '../types/org';
import { ORG_LOGO_PATH } from './firebase';

function loadLogoBase64(src: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas context unavailable'));
        return;
      }
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/jpeg', 0.9));
    };
    img.onerror = () => reject(new Error('Gagal memuat logo kop surat'));
    img.src = src;
  });
}

export async function downloadOfficialLetterPdf(letter: Letter): Promise<void> {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();

  // Kop Surat Header
  try {
    const logoData = await loadLogoBase64(ORG_LOGO_PATH);
    pdf.addImage(logoData, 'JPEG', 18, 12, 24, 24);
  } catch {
    // Continue without logo if unavailable
  }

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(14);
  pdf.text('PERSATUAN PENCAK SILAT INDONESIA (PPSI)', 112, 18, { align: 'center' });
  pdf.setFontSize(16);
  pdf.text('PERGURUAN ALIRAN NURSYAH', 112, 25, { align: 'center' });
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9.5);
  pdf.text('Sekretariat Pengurus Pusat · Sistem Administrasi Digital Terpadu', 112, 31, {
    align: 'center',
  });

  pdf.setDrawColor(15, 23, 42);
  pdf.setLineWidth(0.8);
  pdf.line(18, 40, pageWidth - 18, 40);
  pdf.setLineWidth(0.3);
  pdf.line(18, 41.5, pageWidth - 18, 41.5);

  // Meta Surat
  pdf.setFontSize(10.5);
  let y = 52;
  const rows: [string, string][] = [
    ['Nomor', `: ${letter.nomorSurat}`],
    ['Jenis', `: ${letter.jenisSurat}`],
    ['Tanggal', `: ${letter.tanggalSurat}`],
    ['Perihal', `: ${letter.perihal}`],
    ['Tujuan', `: ${letter.targetRanting ? `${letter.targetRanting} (${letter.targetWilayah})` : letter.targetWilayah}`],
  ];

  rows.forEach(([label, val]) => {
    pdf.setFont('helvetica', 'bold');
    pdf.text(label, 20, y);
    pdf.setFont('helvetica', 'normal');
    const wrapped = pdf.splitTextToSize(val, 140);
    pdf.text(wrapped, 46, y);
    y += wrapped.length * 6;
  });

  y += 6;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(11);
  const bodyLines = pdf.splitTextToSize(letter.isiSurat, pageWidth - 40);
  pdf.text(bodyLines, 20, y);
  y += bodyLines.length * 6 + 18;

  if (y > 245) {
    pdf.addPage();
    y = 30;
  }

  // Signature block
  pdf.setFont('helvetica', 'normal');
  pdf.text(`Ditetapkan pada ${letter.tanggalSurat}`, pageWidth - 75, y);
  pdf.text('Pengurus Organisasi Aliran Nursyah,', pageWidth - 75, y + 6);
  pdf.setFont('helvetica', 'bold');
  pdf.text(letter.penandatangan, pageWidth - 75, y + 26);

  const safeNum = letter.nomorSurat.replace(/[^a-zA-Z0-9_-]+/g, '_');
  pdf.save(`${letter.jenisSurat.replace(/\s+/g, '_')}_${safeNum}.pdf`);
}
