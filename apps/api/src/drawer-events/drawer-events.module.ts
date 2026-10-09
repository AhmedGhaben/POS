import { Module } from "@nestjs/common";
import { DrawerEventsController } from "./drawer-events.controller";
import { DrawerEventsService } from "./drawer-events.service";

@Module({
  controllers: [DrawerEventsController],
  providers: [DrawerEventsService],
})
export class DrawerEventsModule {}
