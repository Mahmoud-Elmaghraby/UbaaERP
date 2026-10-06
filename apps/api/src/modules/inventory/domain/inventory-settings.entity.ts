export type ItemCodeMode = 'manual' | 'auto';
export type BarcodeMode = 'manual' | 'auto';

/** The Inventory module's own settings (Settings › Modules › Inventory). */
export interface InventorySettings {
  /** 'auto': a new product without a code gets the next number of the 'product' numbering sequence. */
  itemCodeMode: ItemCodeMode;
  /** 'auto': a variant saved without a barcode gets a generated internal EAN-13. */
  barcodeMode: BarcodeMode;
  /** Leading digits of generated EAN-13 barcodes (GS1 20–29 = internal use). */
  barcodePrefix: string;
  /** Scale (weighing-machine) barcodes: prefix + item code + embedded weight/price + check digit. */
  scaleBarcodeEnabled: boolean;
  scaleBarcodePrefix: string;
  scaleItemCodeLength: number;
  scaleValueType: ScaleValueType;
  scaleValueDecimals: number;
  updatedAt: Date;
}

export type ScaleValueType = 'weight' | 'price';

export interface UpdateInventorySettingsInput {
  itemCodeMode?: ItemCodeMode;
  barcodeMode?: BarcodeMode;
  barcodePrefix?: string;
  scaleBarcodeEnabled?: boolean;
  scaleBarcodePrefix?: string;
  scaleItemCodeLength?: number;
  scaleValueType?: ScaleValueType;
  scaleValueDecimals?: number;
}
