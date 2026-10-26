import type { Metadata } from "next";
import { OrderStatusView } from "./order-status";

export const metadata: Metadata = { title: "Your order" };

type Props = { params: Promise<{ token: string }> };

export default async function AppOrder({ params }: Props) {
  const { token } = await params;
  return <OrderStatusView token={token} />;
}
