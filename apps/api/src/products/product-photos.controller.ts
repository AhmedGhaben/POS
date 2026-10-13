import { Controller, Get, NotFoundException, Param, Res } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import type { Response } from "express";
import { Public } from "../common/decorators/public.decorator";
import { ProductsService } from "./products.service";

/**
 * Product photos for <img> tags, which can't send a sign-in token. Each photo
 * has a random id that only people who can list the product ever see, and a
 * new upload gets a new id, so they can be cached for good.
 */
@Controller("product-photos")
export class ProductPhotosController {
  constructor(private readonly productsService: ProductsService) {}

  @Public()
  @SkipThrottle()
  @Get(":id")
  async get(@Param("id") id: string, @Res() res: Response) {
    const photo = /^[0-9a-f-]{36}$/.test(id) ? await this.productsService.photo(id) : null;
    if (!photo) throw new NotFoundException("Photo not found");
    res.setHeader("Content-Type", photo.mimeType);
    res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
    res.send(Buffer.from(photo.data));
  }
}
