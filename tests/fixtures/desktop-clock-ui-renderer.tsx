import React from "react";
import { createRoot } from "react-dom/client";
import EnvironmentHomePanel from "../../client/src/components/workstation/EnvironmentHomePanel";
import PrivateAskConnectionMenu from "../../client/src/components/helix/ask-console/PrivateAskConnectionMenu";
import {AgentConnectionSetup} from "../../client/src/components/agent-access/AgentConnectionSetup";
import {useWorkstationLayoutStore} from "../../client/src/store/useWorkstationLayoutStore";

function Connections() {
  const active=useWorkstationLayoutStore(state=>state.groups[state.activeGroupId]?.activePanelId);
  return <><PrivateAskConnectionMenu enabled scope="fixture-external-mcp"/><EnvironmentHomePanel/>
    {active==="agent-access" && <AgentConnectionSetup/>}</>;
}
createRoot(document.getElementById("root")!).render(window.location.hash==="#connections"?<Connections/>:<EnvironmentHomePanel />);
