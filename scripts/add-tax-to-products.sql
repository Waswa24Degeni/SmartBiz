-- Add has_tax to products table to allow item-specific taxation
ALTER TABLE public.products
ADD COLUMN has_tax BOOLEAN NOT NULL DEFAULT false;

-- Add comment for context
COMMENT ON COLUMN public.products.has_tax IS 'If true, standard VAT/tax rate will be applied to this product at checkout';
