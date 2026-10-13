"use client";

import { Database, HardDrive, AlertTriangle } from "lucide-react";
import { motion } from "framer-motion";

interface LiveStorageMeterProps {
  totalRows: number;
}

// Estimated size per row in KB (avg metadata + headers)
const AVG_ROW_SIZE_KB = 0.5;
const MAX_ROWS_FREE_TIER = 50000; // Safe threshold for free tier rows usage

export function LiveStorageMeter({ totalRows }: LiveStorageMeterProps) {
  const estimatedSizeMB = (totalRows * AVG_ROW_SIZE_KB) / 1024;
  const usagePercent = Math.min(100, (totalRows / MAX_ROWS_FREE_TIER) * 100);
  
  const isHigh = usagePercent > 80;
  const isWarning = usagePercent > 50;

  let statusColor = "bg-success";
  let textColor = "text-success";
  
  if (usagePercent >= 90) {
    statusColor = "bg-destructive";
    textColor = "text-destructive";
  } else if (usagePercent >= 70) {
    statusColor = "bg-warning";
    textColor = "text-warning";
  }

  return (
    <div className="flex items-center gap-3 bg-muted px-3 py-1.5 rounded border border-border/40 shadow-inner">
      <div className={`p-1.5 rounded ${statusColor}/10`}>
        <Database className={`h-3.5 w-3.5 ${textColor}`} />
      </div>
      
      <div className="flex flex-col gap-1 min-w-[80px]">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <span className="text-[9px] font-black uppercase tracking-tighter text-muted-foreground whitespace-nowrap">
            DB STRESS (Free)
          </span>
          <span className={`text-[10px] font-mono font-bold ${textColor}`}>
            {usagePercent.toFixed(1)}%
          </span>
        </div>
        
        {/* Progress bar container */}
        <div className="h-1 w-full bg-muted-foreground/10 rounded-full overflow-hidden">
          <motion.div
            className={`h-full rounded-full ${statusColor}`}
            initial={{ width: 0 }}
            animate={{ width: `${usagePercent}%` }}
            transition={{ type: "spring", stiffness: 50, damping: 20 }}
          />
        </div>
      </div>

      <div className="hidden sm:flex flex-col items-end">
        <span className="text-[10px] font-bold text-foreground leading-none">
          {estimatedSizeMB.toFixed(2)} MB
        </span>
        <span className="text-[8px] text-muted-foreground font-medium uppercase">
          {totalRows.toLocaleString()} eventos
        </span>
      </div>

      {isHigh && (
        <motion.div
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ repeat: Infinity, duration: 2 }}
        >
          <AlertTriangle className="h-3 w-3 text-destructive" />
        </motion.div>
      )}
    </div>
  );
}
