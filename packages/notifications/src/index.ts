export interface NotificationPayload {
  title: string;
  body: string;
  icon?: string;
  tag?: string;
}

export interface INotificationPort {
  requestPermission(): Promise<boolean>;
  show(payload: NotificationPayload): Promise<void>;
}

export class MockNotificationAdapter implements INotificationPort {
  public shownNotifications: NotificationPayload[] = [];

  async requestPermission(): Promise<boolean> {
    return true;
  }

  async show(payload: NotificationPayload): Promise<void> {
    this.shownNotifications.push(payload);
  }
}
