import QRCode from 'qrcode';
import { jsPDF } from 'jspdf';
import { Member } from '../types/org';
import { ORG_LOGO_PATH } from './firebase';
import { isBeltEligibleForKta } from '../constants/beltsAndSeed';

export const CATUR_SATYA_ITEMS = [
  'Kami murid-murid Perguruan Nur Syah berbakti kepada Tuhan Yang Maha Esa.',
  'Kami murid-murid Perguruan Nur Syah berbakti kepada Negara dan Bangsa.',
  'Kami murid-murid Perguruan Nur Syah berbakti kepada Kedua Orang Tua.',
  'Kami murid-murid Perguruan Nur Syah berbakti kepada Guru.',
] as const;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Gagal memuat gambar: ${src}`));
    img.src = src;
  });
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapTextLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export async function renderKtaToDataUrl(member: Member): Promise<string> {
  if (!isBeltEligibleForKta(member.sabuk, member.sabukOrder)) {
    throw new Error(
      'Cetak KTA hanya berlaku untuk Sabuk Putih ke atas (Sabuk Putih, Sabuk Hitam, dan Tingkat Strip 1–17).'
    );
  }
  const width = 1012;
  const height = 638;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D tidak didukung browser.');
  }

  // Card Base
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);

  // Subtle geometric border frame
  ctx.strokeStyle = '#CBD5E1';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, width - 4, height - 4);

  // Header Band (Charcoal-Navy + Crimson Stripe)
  ctx.fillStyle = '#0F172A';
  ctx.fillRect(0, 0, width, 152);
  ctx.fillStyle = '#B91C1C';
  ctx.fillRect(0, 144, width, 8);
  ctx.fillStyle = '#D97706';
  ctx.fillRect(0, 152, width, 4);

  // Load Emblem Logo
  try {
    const logo = await loadImage(ORG_LOGO_PATH);
    drawRoundedRect(ctx, 36, 22, 108, 108, 14);
    ctx.save();
    ctx.clip();
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(36, 22, 108, 108);
    ctx.drawImage(logo, 40, 26, 100, 100);
    ctx.restore();
  } catch {
    ctx.fillStyle = '#D97706';
    drawRoundedRect(ctx, 36, 22, 108, 108, 14);
    ctx.fill();
  }

  // Header Typography
  ctx.fillStyle = '#F8FAFC';
  ctx.font = '700 28px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('KARTU TANDA ANGGOTA RESMI', 168, 60);

  ctx.fillStyle = '#FDE68A';
  ctx.font = '700 24px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('ALIRAN NURSYAH · PERSATUAN PENCAK SILAT INDONESIA', 168, 98);

  ctx.fillStyle = '#94A3B8';
  ctx.font = '500 17px "JetBrains Mono", monospace';
  ctx.fillText(`TERVERIFIKASI DIGITAL · KODE ORG: ${member.orgCode}`, 168, 128);

  // Member Photo Frame
  const photoX = 42;
  const photoY = 192;
  const photoW = 216;
  const photoH = 278;

  ctx.fillStyle = '#F1F5F9';
  drawRoundedRect(ctx, photoX, photoY, photoW, photoH, 12);
  ctx.fill();
  ctx.strokeStyle = '#CBD5E1';
  ctx.lineWidth = 2;
  ctx.stroke();

  if (member.fotoProfil) {
    try {
      const avatar = await loadImage(member.fotoProfil);
      ctx.save();
      drawRoundedRect(ctx, photoX, photoY, photoW, photoH, 12);
      ctx.clip();
      const scale = Math.max(photoW / avatar.width, photoH / avatar.height);
      const dw = avatar.width * scale;
      const dh = avatar.height * scale;
      ctx.drawImage(avatar, photoX + (photoW - dw) / 2, photoY + (photoH - dh) / 2, dw, dh);
      ctx.restore();
    } catch {
      drawInitialAvatar(ctx, member.namaLengkap, photoX, photoY, photoW, photoH);
    }
  } else {
    drawInitialAvatar(ctx, member.namaLengkap, photoX, photoY, photoW, photoH);
  }

  // Status line below photo
  ctx.fillStyle = member.statusAktif === 'Aktif' ? '#15803D' : '#B45309';
  ctx.font = '700 18px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(`STATUS: ${member.statusAktif.toUpperCase()}`, photoX, photoY + photoH + 34);

  // Member Identity Details
  const infoX = 294;
  ctx.fillStyle = '#64748B';
  ctx.font = '600 15px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('NOMOR KTA / INDUK ANGGOTA (NIA)', infoX, 212);

  ctx.fillStyle = '#0F172A';
  ctx.font = '700 30px "JetBrains Mono", monospace';
  ctx.fillText(member.nia, infoX, 248);

  const tahunPutih =
    member.tahunDilantikPutih ||
    member.nia.match(/^NRS-(\d{4})-/)?.[1] ||
    '';
  if (tahunPutih) {
    ctx.fillStyle = '#475569';
    ctx.font = '600 13px "JetBrains Mono", monospace';
    ctx.fillText(`DILANTIK SABUK PUTIH: ${tahunPutih}`, infoX + 350, 244);
  }

  ctx.fillStyle = '#64748B';
  ctx.font = '600 15px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('NAMA LENGKAP', infoX, 294);

  ctx.fillStyle = '#0F172A';
  ctx.font = '700 30px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(truncateText(ctx, member.namaLengkap, 460), infoX, 330);

  ctx.fillStyle = '#64748B';
  ctx.font = '600 15px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('RANTING / CABANG LATIHAN', infoX, 376);

  ctx.fillStyle = '#1E293B';
  ctx.font = '600 22px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(truncateText(ctx, member.ranting, 460), infoX, 408);

  ctx.fillStyle = '#475569';
  ctx.font = '500 17px "Plus Jakarta Sans", sans-serif';
  const regionLine = `${member.kecamatan} · ${member.kabupaten} · ${member.provinsi}`;
  ctx.fillText(truncateText(ctx, regionLine, 460), infoX, 436);

  // Belt Level Box
  ctx.fillStyle = '#F8FAFC';
  drawRoundedRect(ctx, infoX, 460, 440, 84, 10);
  ctx.fill();
  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = '#64748B';
  ctx.font = '600 14px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('TINGKATAN SABUK SAAT INI', infoX + 18, 488);

  ctx.fillStyle = member.sabuk.includes('Kuning')
    ? '#B45309'
    : member.sabuk.includes('Putih')
    ? '#334155'
    : member.sabuk.includes('Hitam')
    ? '#0F172A'
    : '#991B1B';
  ctx.font = '700 26px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(member.sabuk, infoX + 18, 524);

  // QR Code Verification Payload
  const verificationPayload = JSON.stringify({
    org: 'PPSI-ALIRAN-NURSYAH',
    nia: member.nia,
    nama: member.namaLengkap,
    ranting: member.ranting,
    sabuk: member.sabuk,
    status: member.statusAktif,
  });

  const qrDataUrl = await QRCode.toDataURL(verificationPayload, {
    width: 210,
    margin: 1,
    color: { dark: '#0F172A', light: '#FFFFFF' },
  });
  const qrImg = await loadImage(qrDataUrl);
  const qrX = 768;
  const qrY = 336;
  ctx.fillStyle = '#FFFFFF';
  drawRoundedRect(ctx, qrX - 10, qrY - 10, 212, 238, 12);
  ctx.fill();
  ctx.strokeStyle = '#CBD5E1';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.drawImage(qrImg, qrX, qrY, 192, 192);

  ctx.fillStyle = '#475569';
  ctx.font = '600 13px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillText('PINDAI VERIFIKASI', qrX + 96, qrY + 216);
  ctx.textAlign = 'left';

  // Footer
  ctx.fillStyle = '#F1F5F9';
  ctx.fillRect(0, 584, width, 54);
  ctx.fillStyle = '#475569';
  ctx.font = '500 15px "Plus Jakarta Sans", sans-serif';
  const issued = new Date().toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
  ctx.fillText(`Diterbitkan Pengurus Pusat Aliran Nursyah · Berlaku selama aktif · Dicetak ${issued}`, 36, 616);

  return canvas.toDataURL('image/png');
}

export async function renderKtaBackToDataUrl(member?: Member): Promise<string> {
  const width = 1012;
  const height = 638;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D tidak didukung browser.');
  }

  // Card Base
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);

  // Outer Frame
  ctx.strokeStyle = '#CBD5E1';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, width - 4, height - 4);

  // Header Band (Matching Charcoal-Navy + Crimson + Gold)
  ctx.fillStyle = '#0F172A';
  ctx.fillRect(0, 0, width, 122);
  ctx.fillStyle = '#B91C1C';
  ctx.fillRect(0, 114, width, 8);
  ctx.fillStyle = '#D97706';
  ctx.fillRect(0, 122, width, 4);

  // Load Emblem Logo (Header + Subtle Center Watermark)
  let loadedLogo: HTMLImageElement | null = null;
  try {
    loadedLogo = await loadImage(ORG_LOGO_PATH);
    drawRoundedRect(ctx, 36, 19, 82, 82, 12);
    ctx.save();
    ctx.clip();
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(36, 19, 82, 82);
    ctx.drawImage(loadedLogo, 40, 23, 74, 74);
    ctx.restore();
  } catch {
    ctx.fillStyle = '#D97706';
    drawRoundedRect(ctx, 36, 19, 82, 82, 12);
    ctx.fill();
  }

  // Header Text
  ctx.fillStyle = '#FDE68A';
  ctx.font = '700 17px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('PERGURUAN PENCAK SILAT ALIRAN NURSYAH · PPSI', 138, 48);

  ctx.fillStyle = '#F8FAFC';
  ctx.font = '800 30px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('NASKAH SUMPAH RESMI CATUR SATYA', 138, 88);

  // Subtle Watermark behind Oath Panel
  if (loadedLogo) {
    ctx.save();
    ctx.globalAlpha = 0.06;
    const wmSize = 310;
    ctx.drawImage(loadedLogo, (width - wmSize) / 2, 175, wmSize, wmSize);
    ctx.restore();
  }

  // Catur Satya Content Container
  const boxX = 44;
  const boxY = 146;
  const boxW = width - 88;
  const boxH = 416;

  ctx.save();
  ctx.fillStyle = 'rgba(248, 250, 252, 0.92)';
  drawRoundedRect(ctx, boxX, boxY, boxW, boxH, 14);
  ctx.fill();
  ctx.strokeStyle = '#CBD5E1';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Left crimson accent stripe inside the oath panel
  ctx.clip();
  ctx.fillStyle = '#B91C1C';
  ctx.fillRect(boxX, boxY, 10, boxH);
  ctx.restore();

  // Pre-measure all 4 Catur Satya items so spacing is always balanced and overflow-free
  const badgeX = boxX + 34;
  const textX = boxX + 94;
  const textMaxW = boxW - 122;
  const lineHeight = 29;
  const itemFont = '600 21px "Plus Jakarta Sans", sans-serif';
  ctx.font = itemFont;

  const measuredItems = CATUR_SATYA_ITEMS.map((oathText) => {
    const lines = wrapTextLines(ctx, oathText, textMaxW);
    const blockH = Math.max(38, lines.length * lineHeight);
    return { lines, blockH };
  });

  const totalTextHeight = measuredItems.reduce((sum, item) => sum + item.blockH, 0);
  const gapY = Math.max(16, Math.min(34, Math.floor((boxH - 48 - totalTextHeight) / 3)));
  const totalContentHeight = totalTextHeight + gapY * (measuredItems.length - 1);
  let cursorY = boxY + Math.round((boxH - totalContentHeight) / 2) + 22;

  measuredItems.forEach((item, idx) => {
    const num = String(idx + 1);

    // Number Badge
    ctx.fillStyle = '#0F172A';
    drawRoundedRect(ctx, badgeX, cursorY - 24, 40, 40, 10);
    ctx.fill();
    ctx.strokeStyle = '#D97706';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#FDE68A';
    ctx.font = '700 20px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(num, badgeX + 20, cursorY + 3);
    ctx.textAlign = 'left';

    // Oath Line(s)
    ctx.fillStyle = '#0F172A';
    ctx.font = itemFont;
    item.lines.forEach((line, lineIdx) => {
      ctx.fillText(line, textX, cursorY + lineIdx * lineHeight);
    });

    if (idx < measuredItems.length - 1) {
      const dividerY = cursorY + item.blockH - 22 + Math.round(gapY / 2);
      ctx.strokeStyle = '#E2E8F0';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(badgeX, dividerY);
      ctx.lineTo(boxX + boxW - 28, dividerY);
      ctx.stroke();
    }

    cursorY += item.blockH + gapY;
  });

  // Footer
  ctx.fillStyle = '#F1F5F9';
  ctx.fillRect(0, 584, width, 54);
  ctx.fillStyle = '#475569';
  ctx.font = '500 15px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(
    'Pemegang kartu wajib mengamalkan Catur Satya dan menjaga kehormatan Perguruan.',
    36,
    616
  );
  if (member?.nia) {
    ctx.fillStyle = '#0F172A';
    ctx.font = '700 15px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`NIA: ${member.nia}`, width - 36, 616);
    ctx.textAlign = 'left';
  }

  return canvas.toDataURL('image/png');
}

function drawInitialAvatar(
  ctx: CanvasRenderingContext2D,
  name: string,
  x: number,
  y: number,
  w: number,
  h: number
) {
  ctx.fillStyle = '#1E293B';
  drawRoundedRect(ctx, x, y, w, h, 12);
  ctx.fill();
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('');
  ctx.fillStyle = '#F8FAFC';
  ctx.font = '700 64px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(initials || 'AN', x + w / 2, y + h / 2 + 22);
  ctx.textAlign = 'left';
}

function truncateText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let truncated = text;
  while (truncated.length > 3 && ctx.measureText(`${truncated}...`).width > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return `${truncated}...`;
}

export async function downloadKtaPng(member: Member, side: 'front' | 'back' = 'front'): Promise<void> {
  if (!isBeltEligibleForKta(member.sabuk, member.sabukOrder)) {
    throw new Error(
      'Cetak KTA hanya berlaku untuk Sabuk Putih ke atas (Sabuk Putih, Sabuk Hitam, dan Tingkat Strip 1–17).'
    );
  }
  const dataUrl =
    side === 'back' ? await renderKtaBackToDataUrl(member) : await renderKtaToDataUrl(member);
  const a = document.createElement('a');
  a.href = dataUrl;
  const suffix = side === 'back' ? 'Belakang' : 'Depan';
  a.download = `KTA-${member.nia}-${member.namaLengkap.replace(/\s+/g, '_')}-${suffix}.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export async function downloadKtaPdfBatch(members: Member[], titleSuffix: string): Promise<void> {
  const eligible = members.filter((m) => isBeltEligibleForKta(m.sabuk, m.sabukOrder));
  if (eligible.length === 0) return;
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const cardW = 85.6; // Standard CR80 width in mm
  const cardH = 54.0; // Standard CR80 height in mm
  const marginX = 14;
  const marginY = 18;
  const gapX = 10.8; // 14 + 85.6 + 10.8 + 85.6 + 14 = 210mm A4 width
  const gapY = 12;

  for (let i = 0; i < eligible.length; i++) {
    if (i > 0 && i % 4 === 0) {
      pdf.addPage();
    }
    const row = i % 4;
    const y = marginY + row * (cardH + gapY);

    const [frontImg, backImg] = await Promise.all([
      renderKtaToDataUrl(eligible[i]),
      renderKtaBackToDataUrl(eligible[i]),
    ]);

    // Left column: Front side, Right column: Back side (Catur Satya)
    pdf.addImage(frontImg, 'PNG', marginX, y, cardW, cardH);
    pdf.addImage(backImg, 'PNG', marginX + cardW + gapX, y, cardW, cardH);
  }

  const safeTitle = titleSuffix.replace(/[^a-zA-Z0-9_-]+/g, '_');
  pdf.save(`KTA_Aliran_Nursyah_${safeTitle}.pdf`);
}
