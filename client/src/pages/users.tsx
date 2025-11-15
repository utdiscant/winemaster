import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Users as UsersIcon } from "lucide-react";
import type { User } from "@shared/schema";

export default function UsersPage() {
  const { data: users, isLoading } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center justify-center py-12">
          <p className="text-muted-foreground" data-testid="text-loading">Loading users...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <UsersIcon className="w-8 h-8 text-primary" />
          <h1 className="text-4xl font-serif font-semibold" data-testid="text-page-title">
            User Overview
          </h1>
        </div>
        <p className="text-muted-foreground">
          View all registered users and their account types
        </p>
      </div>

      <Card>
        <CardContent className="p-0">
          {users && users.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-muted-foreground" data-testid="text-no-users">No users found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>User Type</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users?.map((user) => (
                  <TableRow key={user.id} data-testid={`row-user-${user.id}`}>
                    <TableCell className="font-medium" data-testid={`text-name-${user.id}`}>
                      {user.firstName && user.lastName
                        ? `${user.firstName} ${user.lastName}`
                        : user.firstName || user.lastName || "—"}
                    </TableCell>
                    <TableCell data-testid={`text-email-${user.id}`}>
                      {user.email || "—"}
                    </TableCell>
                    <TableCell data-testid={`text-type-${user.id}`}>
                      <Badge variant={user.isAdmin ? "default" : "secondary"}>
                        {user.isAdmin ? "Admin" : "User"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {users && users.length > 0 && (
        <div className="mt-4 text-sm text-muted-foreground" data-testid="text-total-users">
          Total users: {users.length}
        </div>
      )}
    </div>
  );
}
