/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

import React from 'react';

import { EditFieldFormRow } from '../fields/edit_field';

export const StoreParameter = () => (
  <EditFieldFormRow
    title={<h3>Store field value</h3>}
    description="This is description text."
    formFieldPath="store"
  />
);
