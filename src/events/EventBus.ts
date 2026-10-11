import { Temporal } from "@js-temporal/polyfill";
import { Event } from "./Event";

type Subscription = {
  token: string;
  type: Event.Type | "*";
  listener: (event: Event) => unknown;
};

export class EventBus {
  private readonly subscriptions: Subscription[] = [];

  public publish<T extends Event.Type>(type: T, data: Extract<Event, { type: T }>["data"]) {
    const event = {
      id: Bun.randomUUIDv7(),
      object: "event",
      published: Temporal.Now.instant(),
      type,
      data,
    } as Event;
    this.subscriptions
      .filter(({ type }) => type === event.type || type === "*") //
      .forEach(({ listener }) => listener(event));
  }

  public subscribe(all: "*", listener: (event: Event) => unknown): string;
  public subscribe<T extends Event.Type>(type: T, listener: (event: Extract<Event, { type: T }>) => unknown): string;
  public subscribe<T extends Event.Type>(type: T | "*", listener: (event: Extract<Event, { type: T }>) => unknown): string {
    const subscription: Subscription = {
      type,
      token: Bun.randomUUIDv7(),
      listener: listener as Subscription["listener"],
    };
    this.subscriptions.push(subscription);
    return subscription.token;
  }

  public unsubscribe(token: string) {
    const index = this.subscriptions.findIndex((sub) => sub.token === token);
    if (index >= 0) {
      this.subscriptions.splice(index, 1);
    }
  }
}
