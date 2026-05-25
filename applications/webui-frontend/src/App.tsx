import { Navigate, Route, Routes } from "react-router-dom";

import LatestTopicsPage from "./pages/latest-topics/latest-topics";
import ReportsPage from "./pages/reports/reports";

import AIDigestPage from "@/pages/ai-digest";
import GroupsPage from "@/pages/groups";
import AiChatPage from "@/pages/ai-chat/ai-chat";
import ConfigPage from "@/pages/config-panel/config";

function App() {
    return (
        <Routes>
            <Route element={<Navigate replace to="/latest-topics" />} path="/" />
            <Route element={<Navigate replace to="/latest-topics" />} path="/chat-messages" />
            <Route element={<AIDigestPage />} path="/ai-digest" />
            <Route element={<GroupsPage />} path="/groups" />
            <Route element={<LatestTopicsPage />} path="/latest-topics" />
            <Route element={<ReportsPage />} path="/reports" />
            <Route element={<AiChatPage />} path="/ai-chat" />
            <Route element={<Navigate replace to="/ai-chat" />} path="/rag" />
            <Route element={<ConfigPage />} path="/config" />
            <Route element={<Navigate replace to="/latest-topics" />} path="/system-monitor" />
            <Route element={<Navigate replace to="/latest-topics" />} path="/system-monitor/logs" />
        </Routes>
    );
}

export default App;
