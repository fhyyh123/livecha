import { useParams } from "react-router-dom";

import { VisitorEmbedPage } from "./VisitorEmbedPage";

export function ChatPagePublic() {
    const { siteKey } = useParams();
    return <VisitorEmbedPage siteKey={String(siteKey || "")} />;
}
