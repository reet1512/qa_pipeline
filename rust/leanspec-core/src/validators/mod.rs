//! Validators for spec content and structure

use std::sync::LazyLock;

mod completion;
mod frontmatter;
mod structure;
mod token_count;

pub use completion::CompletionVerifier;
pub use frontmatter::FrontmatterValidator;
pub use structure::StructureValidator;
pub use token_count::TokenCountValidator;

static GLOBAL_FRONTMATTER_VALIDATOR: LazyLock<FrontmatterValidator> =
    LazyLock::new(FrontmatterValidator::new);
static GLOBAL_STRUCTURE_VALIDATOR: LazyLock<StructureValidator> =
    LazyLock::new(StructureValidator::new);
static GLOBAL_TOKEN_COUNT_VALIDATOR: LazyLock<TokenCountValidator> =
    LazyLock::new(TokenCountValidator::new);

/// Global frontmatter validator instance
pub fn global_frontmatter_validator() -> &'static FrontmatterValidator {
    &GLOBAL_FRONTMATTER_VALIDATOR
}

/// Global structure validator instance
pub fn global_structure_validator() -> &'static StructureValidator {
    &GLOBAL_STRUCTURE_VALIDATOR
}

/// Global token count validator instance
pub fn global_token_count_validator() -> &'static TokenCountValidator {
    &GLOBAL_TOKEN_COUNT_VALIDATOR
}
