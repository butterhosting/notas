import { Event } from "@/events/Event";
import { EventBus } from "@/events/EventBus";
import { Initialize } from "@/Initialize";
import { Logger } from "@/Logger";
import { Page } from "@/models/Page";
import { WorkspaceService } from "@/services/WorkspaceService";
import { Temporal } from "@js-temporal/polyfill";
import { ServerMessage } from "./ServerMessage";
import { Socket } from "./Socket";

const HEARTBEAT_INTERVAL_MS = 1_000;

export class SocketService {
  private readonly log = new Logger(__filename);
  private readonly sockets: Socket[] = [];
  private heartbeat?: ReturnType<typeof setInterval>;

  public constructor(
    private readonly eventBus: EventBus,
    private readonly workspaceService: WorkspaceService,
  ) {}

  /**
   * Everyone in the workspace hears of a page change, its author included: one path updates the sidebar, and other tabs
   * notice a body they are editing changed underneath them.
   */
  @Initialize
  public relayEvents() {
    this.eventBus.subscribe("*", async (event) => {
      switch (event.type) {
        case Event.Type.page_created:
        case Event.Type.page_updated:
          return this.send(await this.workspaceService.audience(event.data.page.workspace), {
            type: ServerMessage.Type.page_changed,
            page: Page.summarize(event.data.page),
          });
        case Event.Type.page_restored: {
          const audience = await this.workspaceService.audience(event.data.page.workspace);
          return event.data.pages.forEach((page) => this.send(audience, { type: ServerMessage.Type.page_changed, page }));
        }
        case Event.Type.page_trashed:
        case Event.Type.page_deleted:
          return this.send(await this.workspaceService.audience(event.data.page.workspace), {
            type: ServerMessage.Type.pages_removed,
            ids: event.data.ids,
          });
        case Event.Type.workspaces_changed:
          return this.send(event.data.users, { type: ServerMessage.Type.workspaces_changed });
      }
    });
  }

  public registerSocket = (socket: Socket) => {
    this.log.debug(`Socket connected: ${socket.data.clientId}`);
    this.sockets.push(socket);
  };

  public unregisterSocket = (socket: Socket) => {
    const index = this.sockets.findIndex((s) => s.data.clientId === socket.data.clientId);
    if (index >= 0) {
      this.log.debug(`Socket disconnected: ${socket.data.clientId}`);
      this.sockets.splice(index, 1);
    }
  };

  public startHeartbeat = () => {
    this.heartbeat ??= setInterval(() => {
      this.broadcast({
        type: ServerMessage.Type.heartbeat,
        timestamp: Temporal.Now.instant().toString(),
      });
    }, HEARTBEAT_INTERVAL_MS);
  };

  public broadcast = (message: ServerMessage) => {
    const payload = JSON.stringify(message);
    this.sockets.forEach((socket) => socket.send(payload));
  };

  private send(users: string[], message: ServerMessage) {
    const payload = JSON.stringify(message);
    this.sockets.filter((socket) => users.includes(socket.data.user)).forEach((socket) => socket.send(payload));
  }
}
