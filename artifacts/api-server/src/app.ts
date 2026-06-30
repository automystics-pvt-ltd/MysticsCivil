import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { authMiddleware } from "./middlewares/authMiddleware";
import { loadTenantPlan, FREE_PLAN_FALLBACK } from "./lib/subscription";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors({ credentials: true, origin: true }));
app.use(cookieParser());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(authMiddleware);

// Global tenant-plan middleware: eagerly populate req.tenantPlan for every
// authenticated request so all downstream handlers and middlewares can read
// the plan without awaiting a separate DB call.
// On any error we set FREE_PLAN_FALLBACK explicitly so req.tenantPlan is
// always defined for authenticated requests.
app.use(async (req: Request, _res: Response, next: NextFunction) => {
  if (req.isAuthenticated?.()) {
    try {
      await loadTenantPlan(req);
    } catch {
      // Explicitly set free-plan fallback so req.tenantPlan is never undefined
      // for authenticated requests even when the DB call fails.
      if (!(req as any).tenantPlan) {
        (req as any).tenantPlan = FREE_PLAN_FALLBACK;
      }
    }
  }
  next();
});

app.use("/api", router);

export default app;
