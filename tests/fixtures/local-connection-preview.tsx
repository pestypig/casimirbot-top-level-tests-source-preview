import React from "react";
import { createRoot } from "react-dom/client";
import LocalPersonalConnectionSetup from "../../client/src/components/agent-access/LocalPersonalConnectionSetup";
import { connectionFixture, installationFixture, permissionFixture, tunnelFixture } from "./local-personal-connection";
const output = document.getElementById("navigation")!;
window.casimirDesktop = {getRuntimeSnapshot:async()=>null,getMcpTunnelState:async()=>tunnelFixture(),
  getPrivateEnvironmentState:async()=>installationFixture(),getPrivateClockMcpPermission:async()=>permissionFixture(),
  recoverPrivateClockObservation:async()=>({state:"empty",fresh:false,legacyRecords:0})};
window.fetch = async () => new Response(JSON.stringify(connectionFixture()),{headers:{"Content-Type":"application/json"}});
(window as any).__connectionPreviewOpenPanel = (panel:string) => {output.textContent=`Fixture navigation: ${panel}. The real application opens its existing protected control.`;};
createRoot(document.getElementById("root")!).render(<LocalPersonalConnectionSetup/>);
