import React, { useState } from 'react';
import { SalesStage } from '../types';
import { CheckCircle2, XCircle } from 'lucide-react';

interface StageStep {
  key: SalesStage;
  label: string;
  probability: number;
  criteria: string;
}

const PATH_STAGES: StageStep[] = [
  { key: 'prospect',      label: 'Prospect',      probability: 10,  criteria: 'Contact identified. Initial interest confirmed.' },
  { key: 'qualification', label: 'Qualification', probability: 25,  criteria: 'BANT validated. Budget and timeline confirmed.' },
  { key: 'presentation',  label: 'Presentation',  probability: 50,  criteria: 'Solution demo delivered. Pain points addressed.' },
  { key: 'proposal',      label: 'Proposal',      probability: 70,  criteria: 'Formal quote sent. Terms defined.' },
  { key: 'negotiation',   label: 'Negotiation',   probability: 90,  criteria: 'Legal/Procurement review. Final pricing discussions.' },
  { key: 'closed-won',    label: 'Closed Won',    probability: 100, criteria: 'Deal signed. Ready to convert to project.' },
];

interface Props {
  currentStage: SalesStage;
  onStageChange: (stage: SalesStage) => void;
}

export const PipelinePath: React.FC<Props> = ({ currentStage, onStageChange }) => {
  const [tooltip, setTooltip] = useState<string | null>(null);

  const isLost      = currentStage === 'closed-lost';
  const isDelivered = currentStage === 'project-delivered';
  const isSideExit  = isLost || isDelivered;

  const currentIndex = PATH_STAGES.findIndex(s => s.key === currentStage);
  // For side-exit stages treat as if all 6 stages are "past"
  const effectiveIndex = isSideExit ? PATH_STAGES.length : currentIndex;

  return (
    <div className="px-6 py-3 bg-gray-50 border-b border-gray-200">
      <div className="flex items-center gap-0 min-w-0 overflow-x-auto">

        {PATH_STAGES.map((stage, idx) => {
          const isCompleted = effectiveIndex > idx;
          const isCurrent   = stage.key === currentStage;
          const isLast      = idx === PATH_STAGES.length - 1;

          return (
            <React.Fragment key={stage.key}>
              {/* Stage node */}
              <div className="relative flex flex-col items-center flex-shrink-0" style={{ minWidth: 80 }}>
                {/* Tooltip */}
                {tooltip === stage.key && (
                  <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-50 w-52 bg-gray-900 text-white text-xs rounded-lg p-2.5 shadow-xl pointer-events-none">
                    <p className="font-semibold text-gray-100 mb-1">{stage.label} — {stage.probability}%</p>
                    <p className="text-gray-400 leading-relaxed">{stage.criteria}</p>
                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-gray-900 w-0 h-0" />
                  </div>
                )}

                {/* Circle */}
                <button
                  onMouseEnter={() => setTooltip(stage.key)}
                  onMouseLeave={() => setTooltip(null)}
                  onClick={() => !isSideExit && onStageChange(stage.key)}
                  disabled={isSideExit || isCurrent}
                  className={`
                    w-7 h-7 rounded-full flex items-center justify-center transition-all
                    ${isCurrent
                      ? 'ring-2 ring-offset-2 ring-purple-600'
                      : !isSideExit ? 'hover:scale-110 cursor-pointer' : 'cursor-default'}
                    ${isCompleted || isCurrent
                      ? 'bg-purple-700 text-white'
                      : 'bg-white border-2 border-gray-300 text-gray-300'}
                  `}
                  title={`${stage.label} — click to advance`}
                >
                  {isCompleted
                    ? <CheckCircle2 size={14} strokeWidth={2.5} />
                    : <span className="text-[10px] font-bold leading-none">{idx + 1}</span>
                  }
                </button>

                {/* Label */}
                <span className={`mt-1 text-[10px] font-medium whitespace-nowrap leading-tight text-center
                  ${isCurrent ? 'text-purple-700 font-semibold' : isCompleted ? 'text-purple-500' : 'text-gray-400'}
                `}>
                  {stage.label}
                  {isCurrent && (
                    <span className="block text-[9px] text-purple-400 font-normal">{stage.probability}%</span>
                  )}
                </span>
              </div>

              {/* Connector line */}
              {!isLast && (
                <div className={`h-0.5 flex-1 mx-1 flex-shrink-0 min-w-4 rounded-full transition-all
                  ${isCompleted ? 'bg-purple-400' : 'bg-gray-200'}
                `} />
              )}
            </React.Fragment>
          );
        })}

        {/* Side-exit badge */}
        {isSideExit && (
          <div className={`ml-4 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border flex-shrink-0
            ${isLost
              ? 'bg-red-50 text-red-600 border-red-200'
              : 'bg-teal-50 text-teal-700 border-teal-200'}
          `}>
            {isLost ? <XCircle size={11} /> : <CheckCircle2 size={11} />}
            {isLost ? 'Closed Lost' : 'Project Delivered'}
          </div>
        )}
      </div>
    </div>
  );
};
