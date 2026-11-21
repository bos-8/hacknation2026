ALTER TABLE public.file ADD COLUMN deleting_at timestamptz(3);

-- Serialize attachment with the decision to permanently delete a file.
CREATE FUNCTION public.guard_deleting_product_image() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.image_file_uuid IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.image_file_uuid IS NOT DISTINCT FROM OLD.image_file_uuid THEN
    RETURN NEW;
  END IF;
  PERFORM 1 FROM public.file
    WHERE uuid = NEW.image_file_uuid AND deleting_at IS NULL FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product image is unavailable' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER product_image_deletion_guard
BEFORE INSERT OR UPDATE OF image_file_uuid ON public.product
FOR EACH ROW EXECUTE FUNCTION public.guard_deleting_product_image();
