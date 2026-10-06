import { Module } from '@nestjs/common';
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
  controllers: [
    UnitsOfMeasureController,
    WarehousesController,
    ProductsController,
    ProductVariantsController,
    StockController,
    LandedCostsController,
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
    UnitsOfMeasureService,
    WarehousesService,
    ProductsService,
    StockMovementsService,
    LandedCostsService,
    InventoryEventPublisher,
    GoodsReceiptStockListener,
    PurchaseReturnStockListener,
    DeliveryStockListener,
    SalesReturnStockListener,
  ],
})
export class InventoryModule {}
