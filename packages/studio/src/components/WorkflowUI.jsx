"use client";

import React, { useEffect } from "react";
import { WorkflowBuilder } from "workflow-builder";
import "reactflow/dist/style.css";
import "react-toastify/dist/ReactToastify.css";


const WorkflowUI = ({
  apiKey,
  desktop = false,
  workflowId,
  initialNodeSchemas,
  initialWorkflowData,
  onGenerationStart,
  onGenerationEnd,
  onGenerationComplete,
  onGenerationError,
}) => {
  useEffect(() => {
    if (!desktop) sessionStorage.setItem("fromWorkflowBuilder", "true");
  }, [desktop]);

  return (
    <div className="w-full h-full bg-black">
      <WorkflowBuilder
        apiKey={apiKey}
        workflowId={workflowId}
        initialNodeSchemas={initialNodeSchemas}
        initialWorkflowData={initialWorkflowData}
        costType="dollars"
        onGenerationStart={onGenerationStart}
        onGenerationEnd={onGenerationEnd}
        onGenerationComplete={onGenerationComplete}
        onGenerationError={onGenerationError}
      />
    </div>
  );
};

export default WorkflowUI;
