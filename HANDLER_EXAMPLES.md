/**
 * Example: Handler using sendResponse utility
 * Simplified version showing how to use the new response utils
 */

import { Request, Response } from 'express';
import { sendResponse, sendResult } from '../../shared/response.utils.js';
import { UserController } from './user.controller.js';
import { validateUser, validateUserId } from './user.validator.js';

const userController = new UserController(/* inject dependencies */);

/**
 * OPTION 1: Using sendResponse (all-in-one)
 * Handles validation + controller + response automatically
 */
export async function createUserHandlerV1(req: Request, res: Response): Promise<void> {
  await sendResponse(req, res, {
    validator: (data) => validateUser(data),
    controller: (data) => userController.create(data),
    dataSource: 'body',                    // req.body
    successMessage: 'User created',
    successStatus: 201
  });
}

/**
 * OPTION 2: Using sendResult (manual validation)
 * More control, validate manually then send
 */
export async function getUserByIdHandlerV2(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  
  // Manually validate
  const validation = await validateUserId(id);
  if (!validation.success) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', errors: validation.errors }
    });
  }
  
  // Call controller
  const result = await userController.getById(id);
  
  // Send Result<User, Error> automatically
  sendResult(res, result);  // ✅ Super simple!
}

/**
 * OPTION 3: Full manual (current approach in handler-template.ts)
 * Maximum control, most verbose
 */
export async function updateUserHandlerV3(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  
  // Validate ID
  const idValidation = await validateUserId(id);
  if (!idValidation.success) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', errors: idValidation.errors }
    });
  }
  
  // Validate body
  const bodyValidation = await validateUser(req.body);
  if (!bodyValidation.success) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', errors: bodyValidation.errors }
    });
  }
  
  // Call controller
  const result = await userController.update(id, bodyValidation.data);
  
  // Send response
  if (result.ok) {
    return res.status(200).json({
      success: true,
      data: result.value
    });
  }
  
  return res.status(result.error.statusCode).json({
    success: false,
    error: result.error.toJSON()
  });
}
