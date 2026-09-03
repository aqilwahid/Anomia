import type { TableLayoutTemplate } from "@/domain/layout";

export const LAYOUT_TEMPLATES: Array<{
  value: TableLayoutTemplate;
  label: string;
  description: string;
  icon: string;
  defaultSeatCount: number;
}> = [
  {
    value: "banquet",
    label: "Banquet",
    description: "Meja bundar, diskusi kelompok & makan bersama",
    icon: "donut_large",
    defaultSeatCount: 8,
  },
  {
    value: "classroom",
    label: "Classroom",
    description: "Baris meja sejajar, fokus pada fasilitator & materi",
    icon: "table_restaurant",
    defaultSeatCount: 3,
  },
  {
    value: "conference",
    label: "Conference",
    description: "Satu meja besar, interaksi intensif & pengambilan keputusan",
    icon: "meeting_room",
    defaultSeatCount: 10,
  },
  {
    value: "hollow-square",
    label: "Hollow Square",
    description: "Persegi berongga tengah, diskusi terbuka setara",
    icon: "crop_square",
    defaultSeatCount: 12,
  },
  {
    value: "theater",
    label: "Theater",
    description: "Hanya deretan kursi, kapasitas maksimal audiens",
    icon: "theater_comedy",
    defaultSeatCount: 6,
  },
  {
    value: "ushape",
    label: "U-Shape",
    description: "Formasi tapal kuda, interaksi fasilitator & peserta",
    icon: "u_turn_right",
    defaultSeatCount: 8,
  },
  {
    value: "custom",
    label: "Custom Layout",
    description: "Atur bebas posisi tiap meja & kursi sesuai kebutuhan",
    icon: "tune",
    defaultSeatCount: 4,
  },
];

export function layoutTemplateMeta(value: TableLayoutTemplate) {
  return LAYOUT_TEMPLATES.find((t) => t.value === value) ?? LAYOUT_TEMPLATES[0];
}
