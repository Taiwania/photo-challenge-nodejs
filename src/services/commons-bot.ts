import { Mwn } from "mwn";
import type { BotCredentials } from "../core/models.js";

export type CommonsBotConfig = {
  apiUrl: string;
  userAgent: string;
  credentials: BotCredentials;
};

export type ReadPageResult = {
  title: string;
  content: string;
  revisionTimestamp: string | null;
  revisionId: number | null;
};

export type SavePageResult = {
  title: string;
  newRevisionId: number | null;
  result: string;
};

export type FileInfoLookup = {
  fileName: string;
  exists: boolean;
  user: string | null;
  uploaded: string | null;
  width: number | null;
  height: number | null;
  comment: string | null;
  ownWork: boolean;
  pageText: string | null;
};

export type UserInfoLookup = {
  name: string;
  editCount: number;
  registration: string | null;
  isRegistered: boolean;
  isBlocked: boolean;
};

export type CommonsBot = {
  readPage(title: string): Promise<ReadPageResult>;
  savePage(title: string, text: string, summary: string): Promise<SavePageResult>;
  getCurrentUser(): Promise<string | null>;
  listPagesByPrefix(prefix: string, namespace?: number): Promise<string[]>;
  listFileInfo(fileNames: string[]): Promise<FileInfoLookup[]>;
  getUserInfo(userName: string): Promise<UserInfoLookup | null>;
  userHasPhotoChallengeParticipation(userName: string): Promise<boolean>;
};

export async function createCommonsBot(config: CommonsBotConfig): Promise<CommonsBot> {
  const bot = await loginWithCandidates(config);

  return {
    async readPage(title: string): Promise<ReadPageResult> {
      const page = await bot.read(title, {
        redirects: true
      });

      if (page.missing) {
        throw new Error(`Page does not exist: ${title}`);
      }

      const revision = page.revisions?.[0];
      const content = revision?.content;
      if (typeof content !== "string") {
        throw new Error(`Page content is unavailable for: ${title}`);
      }

      return {
        title: page.title,
        content,
        revisionTimestamp: revision?.timestamp ?? null,
        revisionId: revision?.revid ?? null
      };
    },

    async savePage(title: string, text: string, summary: string): Promise<SavePageResult> {
      const response = await bot.save(title, text, summary);
      return {
        title: response.title,
        newRevisionId: response.newrevid ?? null,
        result: response.result
      };
    },

    async getCurrentUser(): Promise<string | null> {
      const response = await bot.userinfo();
      return response?.name ?? null;
    },

    async listPagesByPrefix(prefix: string, namespace = 4): Promise<string[]> {
      const titles: string[] = [];
      let apcontinue: string | undefined;

      do {
        const response = await bot.request({
          action: "query",
          list: "allpages",
          apnamespace: namespace,
          apprefix: prefix,
          aplimit: 50,
          ...(apcontinue ? { apcontinue } : {})
        });

        const pages = Array.isArray(response?.query?.allpages) ? response.query.allpages : [];
        for (const page of pages) {
          if (typeof page?.title === "string") {
            titles.push(page.title);
          }
        }

        apcontinue = response?.continue?.apcontinue;
      } while (apcontinue);

      return [...new Set(titles)];
    },

    async listFileInfo(fileNames: string[]): Promise<FileInfoLookup[]> {
      const normalizedNames = [...new Set(fileNames.map((fileName) => fileName.trim()).filter(Boolean))];
      const batchSize = 20;
      const results: FileInfoLookup[] = [];

      for (let index = 0; index < normalizedNames.length; index += batchSize) {
        const batch = normalizedNames.slice(index, index + batchSize);
        const response = await bot.request({
          action: "query",
          prop: "imageinfo|revisions",
          titles: batch.map((fileName) => toFileTitle(fileName)),
          iiprop: "user|timestamp|size|comment",
          iilimit: 1,
          rvprop: "content",
          rvslots: "main"
        });

        const pages = Array.isArray(response?.query?.pages) ? response.query.pages : [];
        for (const page of pages) {
          const title = typeof page?.title === "string" ? page.title : "";
          const fileName = fromFileTitle(title);
          const imageInfo = Array.isArray(page?.imageinfo) ? page.imageinfo[0] : undefined;
          const revision = Array.isArray(page?.revisions) ? page.revisions[0] : undefined;
          const pageText = typeof revision?.content === "string" ? revision.content : null;
          const comment = typeof imageInfo?.comment === "string"
            ? imageInfo.comment
            : typeof imageInfo?.parsedcomment === "string"
              ? imageInfo.parsedcomment
              : null;

          results.push({
            fileName,
            exists: !page?.missing,
            user: typeof imageInfo?.user === "string" ? imageInfo.user : null,
            uploaded: typeof imageInfo?.timestamp === "string" ? imageInfo.timestamp : null,
            width: typeof imageInfo?.width === "number" ? imageInfo.width : null,
            height: typeof imageInfo?.height === "number" ? imageInfo.height : null,
            comment,
            ownWork: detectOwnWork(comment, pageText),
            pageText
          });
        }
      }

      const byName = new Map(results.map((result) => [result.fileName, result]));
      return normalizedNames.map((fileName) => byName.get(fileName) ?? {
        fileName,
        exists: false,
        user: null,
        uploaded: null,
        width: null,
        height: null,
        comment: null,
        ownWork: false,
        pageText: null
      });
    },

    async getUserInfo(userName: string): Promise<UserInfoLookup | null> {
      const response = await bot.request({
        action: "query",
        list: "users",
        ususers: userName,
        usprop: "registration|editcount|blockinfo"
      });

      const user = Array.isArray(response?.query?.users) ? response.query.users[0] : null;
      if (!user || typeof user.name !== "string") {
        return null;
      }

      return {
        name: user.name,
        editCount: typeof user.editcount === "number" ? user.editcount : 0,
        registration: typeof user.registration === "string" ? user.registration : null,
        isRegistered: !Boolean(user.missing),
        isBlocked: Boolean(user.blockid || user.blockedby)
      };
    },

    async userHasPhotoChallengeParticipation(userName: string): Promise<boolean> {
      const response = await bot.request({
        action: "query",
        list: "usercontribs",
        ucuser: userName,
        uclimit: 50,
        ucnamespace: 4
      });

      const contribs = Array.isArray(response?.query?.usercontribs) ? response.query.usercontribs : [];
      return contribs.some((contrib) => typeof contrib?.title === "string" && /^Commons:Photo challenge\/[^/]+$/.test(contrib.title));
    }
  };
}

async function loginWithCandidates(config: CommonsBotConfig): Promise<Mwn> {
  const candidates = buildLoginCandidates(config.credentials);
  const errors: string[] = [];

  for (const username of candidates) {
    try {
      return await Mwn.init({
        apiUrl: config.apiUrl,
        userAgent: config.userAgent,
        username,
        password: config.credentials.botPassword,
        defaultParams: {
          assert: "user"
        }
      });
    } catch (error) {
      errors.push(`${username}: ${getErrorMessage(error)}`);
    }
  }

  throw new Error(
    [
      "Unable to log in to Wikimedia Commons with the provided credentials.",
      "Tried usernames:",
      ...candidates.map((candidate) => `- ${candidate}`),
      "Login errors:",
      ...errors.map((entry) => `- ${entry}`)
    ].join("\n")
  );
}

function buildLoginCandidates(credentials: BotCredentials): string[] {
  const rawName = credentials.name.trim();
  const normalized = rawName.replace(/\s+/g, "_");

  return [...new Set([rawName, normalized].filter(Boolean))];
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown error";
}

function toFileTitle(fileName: string): string {
  return `File:${fileName.replace(/ /g, "_")}`;
}

function fromFileTitle(title: string): string {
  return title.replace(/^File:/i, "").replace(/_/g, " ").trim();
}

function detectOwnWork(comment: string | null, pageText: string | null): boolean {
  const normalizedComment = (comment ?? "").toLowerCase();
  const normalizedText = (pageText ?? "").toLowerCase();

  return normalizedComment.includes("own work")
    || normalizedText.includes("{{own}}")
    || normalizedText.includes("{{sf}}")
    || normalizedText.includes("{{own photo}}")
    || normalizedText.includes("{{self-photographed}}");
}
