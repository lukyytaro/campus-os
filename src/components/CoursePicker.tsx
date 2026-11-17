"use client";

import { useState, type FormEvent } from "react";
import { useApp } from "./AppShell";
import { Icon } from "./icons";
import { Button, Field, Input, Modal, Select, useToast } from "./ui";
import { translateError } from "@/lib/errors";
import {
  COURSE_COLOR_NAMES,
  COURSE_COLORS,
  type Course,
} from "@/lib/types";

/**
 * Dropdown mata kuliah dengan opsi "Mata kuliah baru…" yang membuka
 * form tambah inline — supaya pengguna bisa menambah MK tanpa halaman
 * khusus, langsung dari form tugas/jadwal/catatan/nilai.
 */
export function CoursePicker({
  label = "Mata kuliah",
  value,
  onChange,
  courses,
  onCourseAdded,
  allowNone = true,
  noneLabel = "Tanpa mata kuliah",
  required = false,
}: {
  label?: string;
  value: string | null;
  onChange: (courseId: string | null) => void;
  courses: Course[];
  onCourseAdded: (course: Course) => void;
  allowNone?: boolean;
  noneLabel?: string;
  required?: boolean;
}) {
  const { supabase, user, profile } = useApp();
  const toast = useToast();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [lecturer, setLecturer] = useState("");
  const [semester, setSemester] = useState(profile.active_semester);
  const [sks, setSks] = useState(3);
  const [color, setColor] = useState(COURSE_COLORS[0]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  function handleSelect(next: string) {
    if (next === "__new__") {
      setShowForm(true);
      return;
    }
    onChange(next === "" ? null : next);
  }

  async function handleAddCourse(e: FormEvent) {
    e.preventDefault();
    setFormError("");
    if (!name.trim()) {
      setFormError("Nama mata kuliah wajib diisi.");
      return;
    }
    if (sks < 1 || sks > 6) {
      setFormError("SKS harus antara 1 dan 6.");
      return;
    }
    setSaving(true);
    const { data, error } = await supabase
      .from("courses")
      .insert({
        user_id: user.id,
        name: name.trim(),
        code: code.trim(),
        lecturer: lecturer.trim(),
        semester,
        sks,
        color,
      })
      .select("*")
      .single();
    setSaving(false);
    if (error || !data) {
      setFormError(translateError(error, "Gagal menambah mata kuliah."));
      return;
    }
    const course = data as Course;
    onCourseAdded(course);
    onChange(course.id);
    setShowForm(false);
    setName("");
    setCode("");
    setLecturer("");
    setColor(COURSE_COLORS[0]);
    toast("Mata kuliah ditambahkan.");
  }

  return (
    <>
      <Field label={label} required={required}>
        <div className="relative">
          <Select
            value={value ?? ""}
            onChange={(e) => handleSelect(e.target.value)}
            aria-label={label}
          >
            {allowNone && <option value="">{noneLabel}</option>}
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.code ? ` (${c.code})` : ""} — Sem {c.semester}
              </option>
            ))}
            <option value="__new__">+ Mata kuliah baru…</option>
          </Select>
          <Icon
            name="chevronDown"
            className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-zinc-500"
          />
        </div>
      </Field>

      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title="Mata kuliah baru"
      >
        <form onSubmit={handleAddCourse} className="space-y-4" noValidate>
          <Field label="Nama mata kuliah" htmlFor="course-name" required>
            <Input
              id="course-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="mis. Basis Data"
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Kode MK" htmlFor="course-code">
              <Input
                id="course-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="mis. IF301"
              />
            </Field>
            <Field label="SKS" htmlFor="course-sks" required>
              <Input
                id="course-sks"
                type="number"
                min={1}
                max={6}
                step={1}
                value={sks}
                onChange={(e) => setSks(Number(e.target.value))}
              />
            </Field>
          </div>
          <Field label="Dosen pengampu" htmlFor="course-lecturer">
            <Input
              id="course-lecturer"
              value={lecturer}
              onChange={(e) => setLecturer(e.target.value)}
              placeholder="Nama dosen"
            />
          </Field>
          <Field label="Semester" htmlFor="course-semester" required>
            <div className="relative">
              <Select
                id="course-semester"
                value={semester}
                onChange={(e) => setSemester(Number(e.target.value))}
              >
                {Array.from({ length: 14 }, (_, i) => i + 1).map((s) => (
                  <option key={s} value={s}>
                    Semester {s}
                  </option>
                ))}
              </Select>
              <Icon
                name="chevronDown"
                className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-zinc-500"
              />
            </div>
          </Field>
          <Field label="Warna label" htmlFor="course-color">
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Warna label">
              {COURSE_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={color === c}
                  aria-label={COURSE_COLOR_NAMES[c] ?? "Warna"}
                  onClick={() => setColor(c)}
                  className={`h-10 w-10 rounded-full transition-transform ${
                    color === c
                      ? "ring-2 ring-zinc-900 ring-offset-2 dark:ring-white"
                      : "hover:scale-110"
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </Field>
          {formError && (
            <p className="text-sm text-red-600 dark:text-red-400">{formError}</p>
          )}
          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setShowForm(false)}>
              Batal
            </Button>
            <Button type="submit" loading={saving}>
              Simpan mata kuliah
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
