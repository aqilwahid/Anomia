"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { localStore } from "@/store/localStore";
import type { ClassGroup } from "@/domain/participant";

export function ClassList() {
  const [classes, setClasses] = useState<ClassGroup[] | null>(null);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  async function refresh() {
    setClasses(await localStore.listClassGroups());
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setCreating(true);
    try {
      await localStore.createClassGroup(trimmed);
      setName("");
      await refresh();
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-2xl font-semibold">Anomia</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Kelola batch training, upload foto, dan hafal nama peserta lebih cepat.
      </p>

      <form onSubmit={handleCreate} className="mt-8 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nama batch training, mis. Fundamental Cloud - Sept 2026"
          className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
        />
        <button
          type="submit"
          disabled={creating || !name.trim()}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          Buat kelas
        </button>
      </form>

      <ul className="mt-8 divide-y divide-neutral-200 border-t border-neutral-200">
        {classes === null && <li className="py-4 text-sm text-neutral-400">Memuat…</li>}
        {classes?.length === 0 && (
          <li className="py-4 text-sm text-neutral-400">Belum ada kelas. Buat satu di atas.</li>
        )}
        {classes?.map((c) => (
          <li key={c.id} className="py-4">
            <Link href={`/classes/${c.id}`} className="font-medium hover:underline">
              {c.name}
            </Link>
            <div className="text-xs text-neutral-400">
              Dibuat {new Date(c.createdAt).toLocaleDateString("id-ID")}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
