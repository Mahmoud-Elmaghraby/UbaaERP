import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { UNIT_OF_MEASURE_REPOSITORY } from './application/ports/unit-of-measure.repository';
import { WAREHOUSE_REPOSITORY } from './application/ports/warehouse.repository';
import { WAREHOUSE_LOCATION_REPOSITORY } from './application/ports/warehouse-location.repository';
import { PRODUCT_REPOSITORY } from './application/ports/product.repository';
import { PRODUCT_VARIANT_REPOSITORY } from './application/ports/product-variant.repository';
import { STOCK_LEVEL_REPOSITORY } from './application/ports/stock-level.repository';
import { STOCK_MOVEMENT_REPOSITORY } from './application/ports/stock-movement.repository';
import { LANDED_COST_REPOSITORY } from './application/ports/landed-cost.repository';
import { STOCK_LOT_REPOSITORY } from './application/ports/stock-lot.repository';

import { KyselyUnitOfMeasureRepository } from './infrastructure/persistence/kysely-unit-of-measure.repository';
import { KyselyWarehouseRepository } from './infrastructure/persistence/kysely-warehouse.repository';
import { KyselyWarehouseLocationRepository } from './infrastructure/persistence/kysely-warehouse-location.repository';
import { KyselyProductRepository } from './infrastructure/persistence/kysely-product.repository';
import { KyselyProductVariantRepository } from './infrastructure/persistence/kysely-product-variant.repository';
import { KyselyStockLevelRepository } from './infrastructure/persistence/kysely-stock-level.repository';
import { KyselyStockMovementRepository } from './infrastructure/persistence/kysely-stock-movement.repository';
import { KyselyLandedCostRepository } from './infrastructure/persistence/kysely-landed-cost.repository';
import { KyselyStockLotRepository } from './infrastructure/persistence/kysely-stock-lot.repository';

import { UnitsOfMeasureService } from './application/services/units-of-measure.service';
import { WarehousesService } from './application/services/warehouses.service';
import { ProductsService } from './application/services/products.service';
import { StockMovementsService } from './application/services/stock-movements.service';
import { LandedCostsService } from './application/services/landed-costs.service';
import { InventorySettingsService } from './application/services/inventory-settings.service';
import { ProductCodesService } from './application/services/product-codes.service';
import { ProductCatalogService } from './application/services/product-catalog.service';
import { INVENTORY_SETTINGS_REPOSITORY } from './application/ports/inventory-settings.repository';
import { PRODUCT_CATALOG_REPOSITORY } from './application/ports/product-catalog.repository';
import { KyselyInventorySettingsRepository } from './infrastructure/persistence/kysely-inventory-settings.repository';
import { KyselyProductCatalogRepository } from './infrastructure/persistence/kysely-product-catalog.repository';
import { InventorySettingsController } from './presentation/inventory-settings.controller';
import { ProductBrandsController, ProductCategoriesController } from './presentation/product-catalog.controller';

import { UnitsOfMeasureController } from './presentation/units-of-measure.controller';
import { WarehousesController } from './presentation/warehouses.controller';
import { ProductsController } from './presentation/products.controller';
import { ProductVariantsController } from './presentation/product-variants.controller';
import { StockController } from './presentation/stock.controller';
import { LandedCostsController } from './presentation/landed-costs.controller';
import { InventoryEventPublisher } from './infrastructure/events/inventory-event-publisher';
import { GoodsReceiptStockListener } from './infrastructure/events/goods-receipt-stock.listener';
import { PurchaseReturnStockListener } from './infrastructure/events/purchase-return-stock.listener';
import { DeliveryStockListener } from './infrastructure/events/delivery-stock.listener';
import { SalesReturnStockListener } from './infrastructure/events/sales-return-stock.listener';
import { StockCountsController } from './presentation/stock-counts.controller';
import { InventoryReportsController } from './presentation/inventory-reports.controller';
import { STOCK_COUNT_REPOSITORY } from './application/ports/stock-count.repository';
import { INVENTORY_REPORTS_REPOSITORY } from './application/ports/inventory-reports.repository';
import { KyselyStockCountRepository } from './infrastructure/persistence/kysely-stock-count.repository';
import { KyselyInventoryReportsRepository } from './infrastructure/persistence/kysely-inventory-reports.repository';
import { StockCountsService } from './application/services/stock-counts.service';
import { ProductUnitsService } from './application/services/product-units.service';
import { ProductUnitsController } from './presentation/product-units.controller';
import { PRODUCT_UNIT_REPOSITORY } from './application/ports/product-unit.repository';
import { KyselyProductUnitRepository } from './infrastructure/persistence/kysely-product-unit.repository';
import { InventoryReportsService } from './application/services/inventory-reports.service';
import { STOCK_TRANSFER_REPOSITORY } from './application/ports/stock-transfer.repository';
import { STOCK_ADJUSTMENT_REPOSITORY } from './application/ports/stock-adjustment.repository';
import { KyselyStockTransferRepository } from './infrastructure/persistence/kysely-stock-transfer.repository';
import { KyselyStockAdjustmentRepository } from './infrastructure/persistence/kysely-stock-adjustment.repository';
import { StockTransfersService } from './application/services/stock-transfers.service';
import { StockAdjustmentsService } from './application/services/stock-adjustments.service';
import { InventoryValuationEventsService } from './application/services/inventory-valuation-events.service';
import { StockTransfersController } from './presentation/stock-transfers.controller';
import {
  StockAdjustmentReasonsController,
  StockAdjustmentsController,
} from './presentation/stock-adjustments.controller';
import { ProductUnitResolver } from '../../shared/catalog/product-unit-resolver';
import { StockAvailabilityChecker } from '../../shared/catalog/stock-availability-checker';

/**
 * Inventory module (CLAUDE.md §10: step 2). Mostly plain CRUD (units of
 * measure, warehouses, products/variants), with real domain rules
 * concentrated in StockMovementsService (weighted-average valuation, no
 * negative stock — see that file's class comment).
 *
 * TenantConnectionManager comes from the global TenancyModule — not
 * re-provided here, same as Settings/Users & Permissions.
 *
 * No PlanFeatureGuard yet on this module's controllers — see
 * UnitsOfMeasureController's class comment for why (known, deliberate gap
 * against CLAUDE.md §2.8/§6, tracked for a future pass across every
 * optional module at once).
 */
@Module({
  // SettingsModule: NumberingSequencesService for automatic item codes / barcodes
  // (Settings is the foundation module — same dependency Purchases/Sales already take).
  imports: [SettingsModule],
  controllers: [
    InventorySettingsController,
    ProductCategoriesController,
    ProductBrandsController,
    UnitsOfMeasureController,
    WarehousesController,
    ProductsController,
    ProductVariantsController,
    StockController,
    LandedCostsController,
    StockCountsController,
    ProductUnitsController,
    InventoryReportsController,
    StockTransfersController,
    StockAdjustmentsController,
    StockAdjustmentReasonsController,
  ],
  providers: [
    { provide: UNIT_OF_MEASURE_REPOSITORY, useClass: KyselyUnitOfMeasureRepository },
    { provide: WAREHOUSE_REPOSITORY, useClass: KyselyWarehouseRepository },
    { provide: WAREHOUSE_LOCATION_REPOSITORY, useClass: KyselyWarehouseLocationRepository },
    { provide: PRODUCT_REPOSITORY, useClass: KyselyProductRepository },
    { provide: PRODUCT_VARIANT_REPOSITORY, useClass: KyselyProductVariantRepository },
    { provide: STOCK_LEVEL_REPOSITORY, useClass: KyselyStockLevelRepository },
    { provide: STOCK_MOVEMENT_REPOSITORY, useClass: KyselyStockMovementRepository },
    { provide: LANDED_COST_REPOSITORY, useClass: KyselyLandedCostRepository },
    { provide: STOCK_LOT_REPOSITORY, useClass: KyselyStockLotRepository },
    { provide: INVENTORY_SETTINGS_REPOSITORY, useClass: KyselyInventorySettingsRepository },
    { provide: PRODUCT_CATALOG_REPOSITORY, useClass: KyselyProductCatalogRepository },
    { provide: STOCK_COUNT_REPOSITORY, useClass: KyselyStockCountRepository },
    { provide: PRODUCT_UNIT_REPOSITORY, useClass: KyselyProductUnitRepository },
    { provide: INVENTORY_REPORTS_REPOSITORY, useClass: KyselyInventoryReportsRepository },
    InventorySettingsService,
    ProductCodesService,
    ProductCatalogService,
    UnitsOfMeasureService,
    WarehousesService,
    ProductsService,
    StockMovementsService,
    LandedCostsService,
    StockCountsService,
    ProductUnitsService,
    InventoryReportsService,
    { provide: STOCK_TRANSFER_REPOSITORY, useClass: KyselyStockTransferRepository },
    { provide: STOCK_ADJUSTMENT_REPOSITORY, useClass: KyselyStockAdjustmentRepository },
    StockTransfersService,
    StockAdjustmentsService,
    InventoryValuationEventsService,
    ProductUnitResolver,
    StockAvailabilityChecker,
    InventoryEventPublisher,
    GoodsReceiptStockListener,
    PurchaseReturnStockListener,
    DeliveryStockListener,
    SalesReturnStockListener,
  ],
})
export class InventoryModule {}
