import type { TableLayoutTemplate } from "@/domain/layout";

export const LAYOUT_TEMPLATES: Array<{
  value: TableLayoutTemplate;
  label: string;
  description: string;
}> = [
  {
    value: "banquet",
    label: "Banquet",
    description: "Meja bundar berkelompok, cocok untuk diskusi & kerja tim",
  },
  {
    value: "classroom",
    label: "Classroom",
    description: "Baris meja menghadap depan, fokus ke materi & instruktur",
  },
  {
    value: "ushape",
    label: "U-Shape",
    description: "Tapal kuda terbuka ke depan, interaksi instruktur–peserta",
  },
  {
    value: "hollow-square",
    label: "Hollow Square",
    description: "Persegi berongga, semua peserta saling berhadapan setara",
  },
  {
    value: "conference",
    label: "Conference",
    description: "Satu meja panjang, rapat & pengambilan keputusan",
  },
  {
    value: "theater",
    label: "Theater",
    description: "Hanya deretan kursi, kapasitas maksimal untuk seminar",
  },
  {
    value: "custom",
    label: "Custom",
    description: "Mulai dari meja kecil, atur bebas posisi & jumlah kursi",
  },
];

export function layoutTemplateMeta(value: TableLayoutTemplate) {
  return LAYOUT_TEMPLATES.find((t) => t.value === value) ?? LAYOUT_TEMPLATES[0];
}
