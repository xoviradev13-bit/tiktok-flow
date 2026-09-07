import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "@/trpc/root";
import { createContext } from "@/trpc/init";

export const runtime = "nodejs";

const handler = (req: Request) =>
	fetchRequestHandler({
		endpoint: "/api/trpc",
		req,
		router: appRouter,
		createContext,
	});

export { handler as GET, handler as POST };


