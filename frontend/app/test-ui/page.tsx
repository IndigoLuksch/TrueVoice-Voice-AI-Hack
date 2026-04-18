"use client";

import Dashboard from "@/components/Dashboard";
import { mockEvents } from "@/lib/mockEvents";

export default function DesignPreview() {
  return (
    <Dashboard 
      mode="inperson" 
      events={mockEvents} 
      onEndConsultation={() => console.log("End")} 
    />
  );
}