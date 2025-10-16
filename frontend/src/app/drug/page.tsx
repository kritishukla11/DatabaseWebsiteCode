"use client";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

import { Suspense } from "react";
import DrugPageContent from "./DrugPageContent";

export default function DrugPage() {
  return (
    <Suspense fallback={<p>Loading drug page...</p>}>
      <DrugPageContent />
    </Suspense>
  );
}
