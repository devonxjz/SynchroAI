export interface TaskItem {
  id: string;
  tenantId: string;
  title: string;
  status: 'pending' | 'in_progress' | 'completed';
  createdAt: string;
  dueAt?: string;
}

export interface OrderItem {
  id: string;
  tenantId: string;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'refunded';
  amount: number;
  currency: string;
  createdAt?: string;
}

export interface RevenueGroup {
  currency: string;
  totalAmount: number;
  orderCount: number;
}

export interface TasksTodayResult {
  totalPendingInDb: number;
  tasksCreatedToday: number;
  tasksDueToday: number;
  timeRangeUtc: {
    startUtc: string;
    endUtc: string;
  };
}

export function getTimezoneDayBounds(timezone = 'Asia/Ho_Chi_Minh', now = new Date()): { startUtc: string; endUtc: string } {
  // Compute local date string in target timezone
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const localDateStr = formatter.format(now); // "YYYY-MM-DD"

  // Offset in hours for Asia/Ho_Chi_Minh (+7)
  const offsetHours = timezone.includes('Ho_Chi_Minh') || timezone.includes('Bangkok') ? 7 : 0;

  const startLocal = new Date(`${localDateStr}T00:00:00.000Z`);
  startLocal.setUTCHours(startLocal.getUTCHours() - offsetHours);

  const endLocal = new Date(startLocal.getTime() + 24 * 60 * 60 * 1000);

  return {
    startUtc: startLocal.toISOString(),
    endUtc: endLocal.toISOString(),
  };
}

export function aggregateTasksToday(
  allTenantTasks: TaskItem[],
  timezone = 'Asia/Ho_Chi_Minh',
  now = new Date()
): TasksTodayResult {
  const { startUtc, endUtc } = getTimezoneDayBounds(timezone, now);
  const startTime = new Date(startUtc).getTime();
  const endTime = new Date(endUtc).getTime();

  let pendingCount = 0;
  let createdToday = 0;
  let dueToday = 0;

  for (const task of allTenantTasks) {
    if (task.status === 'pending') {
      pendingCount++;
    }

    const createdTime = new Date(task.createdAt).getTime();
    if (createdTime >= startTime && createdTime < endTime) {
      createdToday++;
    }

    if (task.dueAt) {
      const dueTime = new Date(task.dueAt).getTime();
      if (dueTime >= startTime && dueTime < endTime) {
        dueToday++;
      }
    }
  }

  return {
    totalPendingInDb: pendingCount,
    tasksCreatedToday: createdToday,
    tasksDueToday: dueToday,
    timeRangeUtc: { startUtc, endUtc },
  };
}

export function aggregateRevenue(orders: OrderItem[]): RevenueGroup[] {
  const groups = new Map<string, { totalAmount: number; orderCount: number }>();

  for (const order of orders) {
    // Only confirmed or completed orders count toward revenue
    if (order.status !== 'confirmed' && order.status !== 'completed') {
      continue;
    }

    const currency = order.currency.toUpperCase();
    const existing = groups.get(currency) || { totalAmount: 0, orderCount: 0 };
    existing.totalAmount += order.amount;
    existing.orderCount += 1;
    groups.set(currency, existing);
  }

  return Array.from(groups.entries()).map(([currency, data]) => ({
    currency,
    totalAmount: data.totalAmount,
    orderCount: data.orderCount,
  }));
}
