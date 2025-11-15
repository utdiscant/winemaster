import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Users as UsersIcon, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { User } from "@shared/schema";

export default function UsersPage() {
  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  
  const { data: users, isLoading } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (userId: string) => {
      return await apiRequest("DELETE", `/api/users/${userId}`);
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "User deleted successfully",
      });
      setDeletingUserId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
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
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users?.map((user) => {
                  const isCurrentUser = currentUser?.id === user.id;
                  return (
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
                      <TableCell>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => setDeletingUserId(user.id)}
                          disabled={isCurrentUser}
                          title={isCurrentUser ? "You cannot delete your own account" : "Delete user"}
                          data-testid={`button-delete-${user.id}`}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
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

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={!!deletingUserId}
        onOpenChange={(open) => !open && setDeletingUserId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this user and all their review progress. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingUserId && deleteMutation.mutate(deletingUserId)}
              className="bg-destructive text-destructive-foreground"
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
