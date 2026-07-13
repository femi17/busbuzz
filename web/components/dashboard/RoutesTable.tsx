'use client';

import { DeleteRouteButton } from './DeleteRouteButton';
import { TableShell } from './TableShell';

export type RouteTableRow = {
  id: string;
  name: string;
  busPlate: string | null;
  studentCount: number;
};

export function RoutesTable({ routes }: { routes: RouteTableRow[] }) {
  return (
    <TableShell
      rows={routes}
      countNoun="route"
      placeholder="Search routes by name or bus…"
      searchText={(r) => `${r.name} ${r.busPlate ?? ''}`}
    >
      {(filtered) => (
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="bg-canvas border-b border-rule">
              {['Route Name', 'Bus', 'Students', 'Actions'].map((h) => (
                <th
                  key={h}
                  className="bg-canvas px-5 py-3 text-[11px] font-semibold text-sub uppercase tracking-widest"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((route) => (
              <tr
                key={route.id}
                className="border-b border-rule last:border-0 bg-surface hover:bg-canvas/60 transition-colors duration-100"
              >
                <td className="px-5 py-3 text-[14px] font-medium text-ink">{route.name}</td>
                <td className="px-5 py-3 text-[13px] text-sub">
                  {route.busPlate ? route.busPlate : <span className="italic text-sub/60">No bus</span>}
                </td>
                <td className="px-5 py-3 text-[13px] text-sub">{route.studentCount}</td>
                <td className="px-5 py-3">
                  <DeleteRouteButton routeId={route.id} studentCount={route.studentCount} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </TableShell>
  );
}
