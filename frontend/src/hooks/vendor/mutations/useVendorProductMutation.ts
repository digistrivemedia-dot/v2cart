import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createVendorProduct, updateVendorProduct, deleteVendorProduct } from "./vendorProductMutations";
import { VENDOR_QUERY_KEYS } from "../keys";

export const useVendorProductMutation = () => {
  const queryClient = useQueryClient();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: VENDOR_QUERY_KEYS.products() });

  const create = useMutation({
    mutationFn: createVendorProduct,
    onSuccess: () => {
      toast.success("Product submitted — pending admin approval");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message || "Failed to create product"),
  });

  const update = useMutation({
    mutationFn: updateVendorProduct,
    onSuccess: () => {
      toast.success("Product updated");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message || "Failed to update product"),
  });

  const remove = useMutation({
    mutationFn: deleteVendorProduct,
    onSuccess: () => {
      toast.success("Product deleted");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message || "Failed to delete product"),
  });

  return {
    createAsync: create.mutateAsync,
    isCreating: create.isPending,
    updateAsync: update.mutateAsync,
    isUpdating: update.isPending,
    removeAsync: remove.mutateAsync,
    isRemoving: remove.isPending,
  };
};
