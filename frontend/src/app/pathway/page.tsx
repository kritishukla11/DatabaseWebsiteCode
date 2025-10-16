"use client";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

import { Suspense } from "react";
import PathwayPageContent from "./PathwayPageContent";

export default function PathwayPage() {
  return (
    <Suspense fallback={<p>Loading TRN page...</p>}>
      <PathwayPageContent />
    </Suspense>
  );
}